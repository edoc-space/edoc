<?php

declare(strict_types=1);

namespace App\Feature\Plugin;

use App\Path;
use JsonException;
use RuntimeException;

use function array_keys;
use function array_merge;
use function file_exists;
use function file_get_contents;
use function file_put_contents;
use function is_array;
use function is_dir;
use function is_string;
use function json_decode;
use function json_encode;
use function mkdir;
use function preg_match;
use function proc_close;
use function proc_open;
use function str_contains;
use function str_starts_with;
use function trim;

use const JSON_PRETTY_PRINT;
use const JSON_THROW_ON_ERROR;
use const JSON_UNESCAPED_SLASHES;

final readonly class PluginInstaller
{
    private const string DEFAULT_MANIFEST    = 'local/storage/edoc/plugins.json';
    private const string DEFAULT_PLUGINS_DIR = 'local/plugins';

    public function __construct(
        private Path $path,
    ) {
    }

    public function install(
        ?string $manifestPath = null,
        ?string $pluginsPath = null,
        bool $runInstall = true,
        ?string $packageManager = null,
    ): PluginInstallResult {
        $manifestPath = $this->resolvePath($manifestPath ?: self::DEFAULT_MANIFEST);
        $pluginsPath  = $this->resolvePath($pluginsPath ?: self::DEFAULT_PLUGINS_DIR);

        $manifest = $this->readManifest($manifestPath);
        $packageManager ??= $this->stringValue($manifest['packageManager'] ?? '') ?: 'yarn';

        $dependencies         = $this->dependencyMap($manifest['dependencies'] ?? []);
        $optionalDependencies = $this->dependencyMap($manifest['optionalDependencies'] ?? []);
        $resolutions          = $this->dependencyMap($manifest['resolutions'] ?? []);

        $package = [
            'name'    => 'edoc-local-plugins',
            'private' => true,
            'type'    => 'module',
        ];

        if ($dependencies !== []) {
            $package['dependencies'] = $dependencies;
        }

        if ($optionalDependencies !== []) {
            $package['optionalDependencies'] = $optionalDependencies;
        }

        if ($resolutions !== []) {
            $package['resolutions'] = $resolutions;
        }

        $this->ensureDirectory($pluginsPath);

        $packagePath = $pluginsPath . '/package.json';
        file_put_contents(
            $packagePath,
            json_encode($package, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n",
        );

        $exitCode = null;
        if ($runInstall && ($dependencies !== [] || $optionalDependencies !== [])) {
            $exitCode = $this->runPackageManagerInstall($packageManager, $pluginsPath);
            if ($exitCode !== 0) {
                throw new RuntimeException($packageManager . ' install failed with exit code ' . $exitCode . '.');
            }
        }

        return new PluginInstallResult(
            manifestPath: $manifestPath,
            pluginsPath: $pluginsPath,
            packagePath: $packagePath,
            dependencies: array_keys(array_merge($dependencies, $optionalDependencies)),
            installed: $runInstall && ($dependencies !== [] || $optionalDependencies !== []),
            installExitCode: $exitCode,
        );
    }

    /**
     * @return array<string,mixed>
     */
    private function readManifest(string $manifestPath): array
    {
        if (!file_exists($manifestPath)) {
            return [];
        }

        $contents = file_get_contents($manifestPath);
        if (!is_string($contents)) {
            throw new RuntimeException('Unable to read plugin manifest: ' . $manifestPath);
        }

        try {
            $decoded = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('Invalid plugin manifest JSON: ' . $exception->getMessage(), previous: $exception);
        }

        if (!is_array($decoded)) {
            throw new RuntimeException('Plugin manifest must be a JSON object.');
        }

        return $decoded;
    }

    /**
     * @return array<string,string>
     */
    private function dependencyMap(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $dependencies = [];
        foreach ($value as $name => $version) {
            if (!is_string($name) || !is_string($version)) {
                throw new RuntimeException('Plugin dependencies must be an object of package names and version constraints.');
            }

            $name    = trim($name);
            $version = trim($version);

            if (!$this->isPackageName($name)) {
                throw new RuntimeException('Invalid plugin package name: ' . $name);
            }

            if ($version === '' || str_contains($version, "\n") || str_contains($version, "\r")) {
                throw new RuntimeException('Invalid version constraint for plugin package: ' . $name);
            }

            $dependencies[$name] = $version;
        }

        return $dependencies;
    }

    private function isPackageName(string $name): bool
    {
        return preg_match('/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i', $name) === 1;
    }

    private function resolvePath(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            throw new RuntimeException('Path must not be empty.');
        }

        return str_starts_with($path, '/') ? $path : $this->path->createPath($path);
    }

    private function ensureDirectory(string $path): void
    {
        if (is_dir($path)) {
            return;
        }

        if (!mkdir($path, 0775, true) && !is_dir($path)) {
            throw new RuntimeException('Unable to create directory: ' . $path);
        }
    }

    private function runPackageManagerInstall(string $packageManager, string $pluginsPath): int
    {
        $command = match ($packageManager) {
            'yarn'  => ['yarn', 'install', '--non-interactive'],
            'npm'   => ['npm', 'install'],
            default => throw new RuntimeException('Unsupported plugin package manager: ' . $packageManager),
        };

        $process = proc_open($command, [
            0 => ['file', '/dev/null', 'r'],
            1 => ['file', 'php://stdout', 'w'],
            2 => ['file', 'php://stderr', 'w'],
        ], $pipes, $pluginsPath);

        if ($process === false) {
            throw new RuntimeException('Unable to start ' . $packageManager . ' install.');
        }

        return proc_close($process);
    }

    private function stringValue(mixed $value): string
    {
        return is_string($value) ? trim($value) : '';
    }
}
