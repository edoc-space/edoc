<?php

declare(strict_types=1);

namespace App\Feature\Theme;

use FilesystemIterator;
use JsonException;
use RecursiveCallbackFilterIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

use function array_is_list;
use function array_key_exists;
use function array_keys;
use function clearstatcache;
use function count;
use function dirname;
use function explode;
use function file_get_contents;
use function getcwd;
use function hash;
use function hash_file;
use function in_array;
use function is_array;
use function is_dir;
use function is_file;
use function is_link;
use function is_string;
use function json_decode;
use function json_encode;
use function ksort;
use function pathinfo;
use function preg_match;
use function readlink;
use function realpath;
use function str_contains;
use function str_ends_with;
use function str_starts_with;
use function strlen;
use function substr;
use function uasort;

use const JSON_THROW_ON_ERROR;
use const JSON_UNESCAPED_SLASHES;
use const PATHINFO_EXTENSION;
use const SORT_STRING;

/** Build and PHP use the same trusted configuration and fingerprint algorithm. */
final readonly class ThemeResolver
{
    public const int CONTRACT_VERSION = 1;

    public function __construct(
        private string $engineRoot,
        private string $siteRoot,
    ) {
    }

    /** @return array{id:string,source:string,contractVersion:int,fingerprint:string,entry:string,root:string} */
    public function resolve(): array
    {
        $config = is_file($this->siteRoot . '/site.json') ? $this->json($this->siteRoot . '/site.json') : [];
        if (array_key_exists('theme', $config) && (!is_array($config['theme']) || !isset($config['theme']['id']))) {
            throw new ThemeException('theme.invalid: theme должен быть объектом с текстовым id.');
        }
        $id = $config['theme']['id'] ?? 'default';
        if (!is_string($id) || ($id !== 'default' && $id !== 'local' && preg_match('~^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$~D', $id) !== 1)) {
            throw new ThemeException('theme.unknown: Укажите default, local или имя установленного пакета в корневом site.json.');
        }
        $source = match ($id) {
            'default' => 'builtin',
            'local'   => 'local',
            default   => 'package',
        };
        $root = match ($source) {
            'builtin' => $this->engineRoot . '/resources/js/Themes/default',
            'local'   => $this->siteRoot . '/theme',
            default   => $this->packageRoot($id),
        };
        if (!is_file($root . '/theme.json')) {
            throw new ThemeException('theme.unknown: Тема не найдена. Подготовьте theme/theme.json либо установите выбранный пакет перед сборкой.');
        }
        $descriptor = $this->json($root . '/theme.json');
        if (($descriptor['contractVersion'] ?? null) !== self::CONTRACT_VERSION) {
            throw new ThemeException('theme.incompatible: Требуется контракт темы v1. Обновите тему или выберите совместимую.');
        }
        $entry = $descriptor['entry'] ?? null;
        if (!is_string($entry) || !$this->relativePath($entry)) {
            throw new ThemeException('theme.invalid: entry должен указывать на существующий JS/TS модуль внутри темы.');
        }
        $realRoot  = realpath($root);
        $realEntry = is_string($entry) ? realpath($root . '/' . $entry) : false;
        if (!is_string($entry) || $entry === '' || str_contains($entry, '\\') || str_starts_with($entry, '/') || in_array('..', explode('/', $entry), true)
            || $realRoot === false || $realEntry === false || !str_starts_with($realEntry, $realRoot . '/') || !is_file($realEntry)
            || !in_array(pathinfo($realEntry, PATHINFO_EXTENSION), ['js', 'jsx', 'ts', 'tsx', 'mjs'], true)) {
            throw new ThemeException('theme.invalid: entry должен указывать на существующий JS/TS модуль внутри темы.');
        }
        $hashes = $this->hashes($this->engineRoot . '/resources/js', 'engine/');
        if ($source !== 'builtin') {
            $hashes += $this->hashes($realRoot, 'theme/');
        }
        ksort($hashes, SORT_STRING);
        $fingerprint = hash('sha256', json_encode([$id, self::CONTRACT_VERSION, $hashes], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

        return ['id' => $id, 'source' => $source, 'contractVersion' => self::CONTRACT_VERSION, 'fingerprint' => $fingerprint, 'entry' => $realEntry, 'root' => $realRoot];
    }

    /**
     * @param array<string,mixed> $theme
     * @param list<string> $files Files and watched directories declared by the production bundler.
     * @return array<string,mixed>
     */
    public function manifest(array $theme, array $files = []): array
    {
        $roots      = $this->inputRoots($theme);
        $paths      = $this->pathRoots($theme);
        $references = [];
        if ($files !== []) {
            foreach ($roots as $name => $root) {
                $references['dir:' . $name . ':.'] = true;
                // Node resolution may acquire a nearer package without changing
                // an already consumed module. Track shallow lookup inventories.
                if (str_ends_with($name, '_modules')) {
                    $this->watchModuleDirectory($root, $roots, $references);
                }
            }
        }
        foreach ($files as $file) {
            $actual = $this->watchPath($file, $roots, $paths, $references);
            if (is_dir($actual)) {
                $visited = [];
                $this->watchDirectory($file, $roots, $paths, $references, $visited);
                continue;
            }
            $reference = null;
            foreach ($roots as $name => $root) {
                if (str_starts_with($actual, $root . '/')) {
                    $path                   = substr($actual, strlen($root) + 1);
                    $reference              = 'file:' . $name . ':' . $path;
                    $references[$reference] = true;
                    // Include resolution metadata and shallow directory inventories:
                    // additions, package exports and shadowing must not accept an old build.
                    $directory = dirname($path);
                    while (true) {
                        $references['dir:' . $name . ':' . $directory] = true;
                        $modules                                       = $root . '/' . $directory . '/node_modules';
                        if (is_dir($modules)) {
                            $this->watchModuleDirectory($modules, $roots, $references);
                        }
                        $package = $root . '/' . $directory . '/package.json';
                        if (is_file($package)) {
                            $references['file:' . $name . ':' . ($directory === '.' ? '' : $directory . '/') . 'package.json'] = true;
                        }
                        if ($directory === '.') {
                            break;
                        }
                        $directory = dirname($directory);
                    }
                    break;
                }
            }
            if ($reference === null) {
                throw new ThemeException('theme.invalid: Импорт вне корней сайта, движка, темы и установленных зависимостей не поддерживается. Перенесите вход внутрь поддерживаемого корня.');
            }
        }
        $inputs = $this->inputHashes(array_keys($references), $roots, $paths);

        return $this->metadata($theme, $inputs);
    }

    /** @param array<string,mixed>|null $manifest @return array{code:string,message:string}|null */
    public function diagnostic(?array $manifest): ?array
    {
        // Links may be switched by another process while this PHP worker lives.
        clearstatcache(true);
        try {
            $theme = $this->resolve();
            if (($manifest['schemaVersion'] ?? null) !== 2 || !is_array($manifest['inputs'] ?? null)) {
                throw $this->stale();
            }
            $inputs   = $this->inputHashes(array_keys($manifest['inputs']), $this->inputRoots($theme), $this->pathRoots($theme));
            $expected = $this->metadata($theme, $inputs);
            foreach ($expected as $key => $value) {
                if (($manifest[$key] ?? null) !== $value) {
                    throw $this->stale();
                }
            }
        } catch (ThemeException $exception) {
            return ['code' => explode(':', $exception->getMessage(), 2)[0], 'message' => $exception->getMessage()];
        }

        return null;
    }

    /** @param array<string,mixed> $theme @param array<string,string> $inputs @return array<string,mixed> */
    private function metadata(array $theme, array $inputs): array
    {
        return ['schemaVersion' => 2, 'id' => $theme['id'], 'source' => $theme['source'], 'contractVersion' => $theme['contractVersion'],
            'fingerprint'       => hash('sha256', json_encode([$theme['fingerprint'], $inputs], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)), 'inputs' => $inputs];
    }

    /** @param array<string,mixed> $theme @return array<string,string> */
    private function pathRoots(array $theme): array
    {
        $candidates = [
            'theme'          => $theme['root'],
            'site_modules'   => $this->siteRoot . '/node_modules',
            'plugin_modules' => $this->engineRoot . '/local/plugins/node_modules',
            'engine_modules' => $this->engineRoot . '/node_modules',
            'site'           => $this->siteRoot,
            'engine'         => $this->engineRoot,
        ];
        $roots = [];
        foreach ($candidates as $name => $path) {
            $real = realpath($path);
            if ($real !== false) {
                $roots[$name] = str_starts_with($path, '/') ? $path : getcwd() . '/' . $path;
            }
        }
        // Most specific logical root wins; no absolute location is serialized.
        uasort($roots, static fn (string $a, string $b): int => strlen($b) <=> strlen($a));

        return $roots;
    }

    /** @param array<string,mixed> $theme @return array<string,string> */
    private function inputRoots(array $theme): array
    {
        $roots = [];
        foreach ($this->pathRoots($theme) as $name => $path) {
            $roots[$name] = realpath($path);
        }
        uasort($roots, static fn (string $a, string $b): int => strlen($b) <=> strlen($a));

        return $roots;
    }

    /** @param list<string|int> $references @param array<string,string> $roots @param array<string,string> $paths @return array<string,string> */
    private function inputHashes(array $references, array $roots, array $paths): array
    {
        $hashes = [];
        foreach ($references as $reference) {
            if (!is_string($reference)) {
                throw $this->stale();
            }
            $parts = explode(':', $reference, 3);
            if (count($parts) !== 3 || !isset($roots[$parts[1]]) || !in_array($parts[0], ['file', 'dir', 'watchdir', 'resolve'], true) || !$this->relativePath($parts[2])) {
                throw $this->stale();
            }
            [$kind, $name, $relative] = $parts;
            if ($kind === 'resolve') {
                $hashes[$reference] = $this->resolutionHash($paths[$name], $relative, $roots);
                continue;
            }
            $path = realpath($roots[$name] . '/' . $relative);
            if ($path === false || ($path !== $roots[$name] && !str_starts_with($path, $roots[$name] . '/'))) {
                throw $this->stale();
            }
            if ($kind === 'file' && is_file($path)) {
                $hashes[$reference] = hash_file('sha256', $path);
            } elseif (in_array($kind, ['dir', 'watchdir'], true) && is_dir($path)) {
                $entries = [];
                foreach (new FilesystemIterator($path, FilesystemIterator::SKIP_DOTS) as $file) {
                    $filename = $file->getFilename();
                    if ($kind === 'dir' && (in_array($filename, ['.git', '.vite', '.vite-temp', '.cache'], true)
                        || ($name === 'engine' && $relative === 'local' && in_array($filename, ['cache', 'logs', 'tests'], true)))) {
                        continue;
                    }
                    $entries[$filename] = $file->isLink() ? 'link:' . readlink($file->getPathname()) : ($file->isDir() ? 'dir' : 'file');
                }
                ksort($entries, SORT_STRING);
                $hashes[$reference] = hash('sha256', json_encode($entries, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
            } else {
                throw $this->stale();
            }
        }
        ksort($hashes, SORT_STRING);

        return $hashes;
    }

    /**
     * Preserve declaration identity before canonical content de-duplication.
     * @param array<string,string> $roots
     * @param array<string,string> $paths
     * @param array<string,bool> $references
     */
    private function watchPath(string $path, array $roots, array $paths, array &$references): string
    {
        if (preg_match('/[\x00-\x1F\x7F]/', $path) === 1) {
            throw new ThemeException('theme.invalid: Некорректный путь входа сборки.');
        }
        $actual = realpath($path);
        if ($actual === false || (!is_file($actual) && !is_dir($actual))) {
            throw new ThemeException('theme.invalid: Вход сборки отсутствует или имеет неподдерживаемый тип.');
        }
        $this->inputReference($actual, $roots);
        $reference = null;
        $length    = -1;
        foreach ([$paths, $roots] as $locations) {
            foreach ($locations as $name => $root) {
                if (($path === $root || str_starts_with($path, $root . '/')) && strlen($root) > $length) {
                    $relative  = $path === $root ? '.' : substr($path, strlen($root) + 1);
                    $reference = 'resolve:' . $name . ':' . $relative;
                    $length    = strlen($root);
                }
            }
        }
        if ($reference === null) {
            throw new ThemeException('theme.invalid: Импорт вне корней сайта, движка, темы и установленных зависимостей не поддерживается.');
        }
        $references[$reference] = true;

        return $actual;
    }

    /** @param array<string,string> $roots */
    private function resolutionHash(string $root, string $relative, array $roots): string
    {
        $path      = $root;
        $links     = [];
        $component = '';
        foreach (explode('/', $relative) as $part) {
            if ($part === '.') {
                continue;
            }
            $path .= '/' . $part;
            $component = $component === '' ? $part : $component . '/' . $part;
            if (is_link($path)) {
                $links[$component] = readlink($path);
            }
        }
        $actual = realpath($path);
        if ($actual === false || (!is_file($actual) && !is_dir($actual))) {
            throw $this->stale();
        }
        $target = $this->inputReference($actual, $roots, is_dir($actual) ? 'dir' : 'file');

        return hash('sha256', json_encode([$target, $links], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
    }

    /**
     * Expand explicitly watched trees only at build time. Runtime checks the
     * recorded files and exact inventories; it never discovers new subtrees.
     * @param array<string,string> $roots
     * @param array<string,string> $paths
     * @param array<string,bool> $references
     * @param array<string,bool> $visited
     */
    private function watchDirectory(string $directory, array $roots, array $paths, array &$references, array &$visited): void
    {
        $this->watchPath($directory, $roots, $paths, $references);
        $reference = $this->inputReference($directory, $roots, 'watchdir');
        if (isset($visited[$reference])) {
            return;
        }
        $visited[$reference]    = true;
        $references[$reference] = true;
        foreach (new FilesystemIterator($directory, FilesystemIterator::SKIP_DOTS) as $entry) {
            $actual = realpath($entry->getPathname());
            if ($actual === false) {
                throw new ThemeException('theme.invalid: Вход объявленного каталога отсутствует. Проверьте зависимости сборки.');
            }
            if (is_dir($actual)) {
                $this->watchDirectory($entry->getPathname(), $roots, $paths, $references, $visited);
            } elseif (is_file($actual)) {
                if ($entry->isLink()) {
                    $this->watchPath($entry->getPathname(), $roots, $paths, $references);
                }
                $references[$this->inputReference($actual, $roots, 'file')] = true;
            } else {
                throw new ThemeException('theme.invalid: Объявленный каталог должен содержать только файлы и каталоги.');
            }
        }
    }

    /** @param array<string,string> $roots @param array<string,bool> $references */
    private function watchModuleDirectory(string $directory, array $roots, array &$references): void
    {
        $references[$this->inputReference($directory, $roots)] = true;
        // Every lookup location has the same shallow inventory semantics,
        // including nested/aliased node_modules and existing package scopes.
        // A new scope changes the parent; a new scoped package changes its scope.
        foreach (new FilesystemIterator($directory, FilesystemIterator::SKIP_DOTS) as $entry) {
            if (str_starts_with($entry->getFilename(), '@') && $entry->isDir()) {
                $references[$this->inputReference($entry->getPathname(), $roots)] = true;
            }
        }
    }

    /** @param array<string,string> $roots */
    private function inputReference(string $directory, array $roots, string $kind = 'dir'): string
    {
        $actual = realpath($directory);
        foreach ($roots as $name => $root) {
            if ($actual === $root) {
                return $kind . ':' . $name . ':.';
            }
            if (is_string($actual) && str_starts_with($actual, $root . '/')) {
                return $kind . ':' . $name . ':' . substr($actual, strlen($root) + 1);
            }
        }

        throw new ThemeException('theme.invalid: Импорт вне корней сайта, движка, темы и установленных зависимостей не поддерживается. Перенесите вход внутрь поддерживаемого корня.');
    }

    private function relativePath(string $path): bool
    {
        return $path !== '' && !str_starts_with($path, '/') && !str_contains($path, '\\')
            && preg_match('/[\x00-\x1F\x7F?:#]/', $path) !== 1 && !in_array('..', explode('/', $path), true);
    }

    private function stale(): ThemeException
    {
        return new ThemeException('theme.stale: Сборка темы отсутствует или устарела. Выполните production-сборку этого сайта и обновите её вместе с исходниками.');
    }

    private function packageRoot(string $id): string
    {
        foreach ([$this->siteRoot . '/node_modules', $this->engineRoot . '/local/plugins/node_modules', $this->engineRoot . '/node_modules'] as $directory) {
            if (is_file($directory . '/' . $id . '/package.json')) {
                return $directory . '/' . $id;
            }
        }

        throw new ThemeException('theme.unknown: Пакет темы не установлен. Подготовьте зависимости в закреплённом build-профиле; HTTP ничего не устанавливает.');
    }

    /** @return array<string,mixed> */
    private function json(string $path): array
    {
        try {
            $value = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ThemeException('theme.invalid: Проверьте JSON конфигурации сайта или theme.json.');
        }
        if (!is_array($value) || array_is_list($value) && $value !== []) {
            throw new ThemeException('theme.invalid: Конфигурация темы должна быть JSON-объектом.');
        }

        return $value;
    }

    /** @return array<string,string> */
    private function hashes(string $root, string $prefix): array
    {
        $hashes   = [];
        $iterator = new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
            static fn ($file): bool => !in_array($file->getFilename(), ['.git', 'node_modules'], true),
        ));

        foreach ($iterator as $file) {
            $path = substr($file->getPathname(), strlen($root) + 1);
            if (preg_match('~(^|/)(?:node_modules|\.git)(/|$)~', $path) === 1) {
                continue;
            }
            if ($file->isLink()) {
                throw new ThemeException('theme.invalid: Внутренние файлы темы не должны быть символическими ссылками.');
            }
            if ($file->isFile()) {
                $hashes[$prefix . $path] = hash_file('sha256', $file->getPathname());
            }
        }

        return $hashes;
    }
}
