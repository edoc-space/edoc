<?php

declare(strict_types=1);

namespace App\Tests\Unit\Feature\Theme;

use App\Feature\Theme\ThemeException;
use App\Feature\Theme\ThemeResolver;
use FilesystemIterator;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

use function array_keys;
use function array_map;
use function bin2hex;
use function dirname;
use function fclose;
use function file_put_contents;
use function is_dir;
use function json_encode;
use function mkdir;
use function proc_close;
use function proc_open;
use function random_bytes;
use function rmdir;
use function symlink;
use function sys_get_temp_dir;
use function unlink;

use const JSON_THROW_ON_ERROR;
use const PHP_BINARY;

final class ThemeResolverTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/edoc-theme-' . bin2hex(random_bytes(6));
        mkdir($this->root . '/site', 0775, true);
        mkdir($this->root . '/engine/resources/js/Themes/default', 0775, true);
        $this->write('engine/resources/js/Themes/default/theme.json', ['contractVersion' => 1, 'entry' => 'index.tsx']);
        file_put_contents($this->root . '/engine/resources/js/Themes/default/index.tsx', 'export default {}');
    }

    protected function tearDown(): void
    {
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($this->root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);

        foreach ($iterator as $file) {
            $file->isDir() && !$file->isLink() ? rmdir($file->getPathname()) : unlink($file->getPathname());
        }
        rmdir($this->root);
    }

    public function testDefaultAndLocalUseSameContractAndFingerprintTracksSource(): void
    {
        $resolver = $this->resolver();
        $default  = $resolver->resolve();
        self::assertSame('default', $default['id']);
        self::assertSame(1, $default['contractVersion']);
        $this->localTheme();
        $local = $resolver->resolve();
        self::assertSame('local', $local['id']);
        self::assertNotSame($default['fingerprint'], $local['fingerprint']);
        file_put_contents($this->root . '/site/theme/index.tsx', 'export default { Header() {} }');
        self::assertNotSame($local['fingerprint'], $resolver->resolve()['fingerprint']);
        $this->write('site/ru/site.json', ['theme' => ['id' => 'unknown']]);
        self::assertSame('local', $resolver->resolve()['id']);
    }

    public function testInstalledPackageAndDependenciesContributeToFingerprint(): void
    {
        $this->write('site/site.json', ['theme' => ['id' => '@fixture/theme']]);
        $this->write('site/node_modules/@fixture/theme/package.json', ['name' => '@fixture/theme', 'version' => '1.0.0']);
        $this->write('site/node_modules/@fixture/theme/theme.json', ['contractVersion' => 1, 'entry' => 'index.js']);
        file_put_contents($this->root . '/site/node_modules/@fixture/theme/index.js', 'export default {}');
        $theme = $this->resolver()->resolve();
        self::assertSame('package', $theme['source']);
        self::assertSame('@fixture/theme', $theme['id']);
        self::assertArrayNotHasKey('entry', $this->resolver()->manifest($theme));
        self::assertStringNotContainsString($this->root, json_encode($this->resolver()->manifest($theme)));
        file_put_contents($this->root . '/site/node_modules/@fixture/theme/helper.js', 'export const value = 1');
        self::assertNotSame($theme['fingerprint'], $this->resolver()->resolve()['fingerprint']);
    }

    public function testUnknownThemeHasSafeActionableError(): void
    {
        $this->write('site/site.json', ['theme' => ['id' => '../../secret']]);
        $this->expectException(ThemeException::class);
        $this->expectExceptionMessage('theme.unknown');
        $this->resolver()->resolve();
    }

    public function testIncompatibleVersionIsRejected(): void
    {
        $this->localTheme();
        $this->write('site/theme/theme.json', ['contractVersion' => 2, 'entry' => 'index.tsx']);
        $this->expectExceptionMessage('theme.incompatible');
        $this->resolver()->resolve();
    }

    public function testEscapingEntrypointIsRejected(): void
    {
        $this->localTheme();
        $this->write('site/theme/theme.json', ['contractVersion' => 1, 'entry' => '../site.json']);
        $this->expectExceptionMessage('theme.invalid');
        $this->resolver()->resolve();
    }

    public function testManifestMustMatchSelectionSourcesAndVersion(): void
    {
        $resolver = $this->resolver();
        $theme    = $resolver->resolve();
        self::assertNull($resolver->diagnostic($resolver->manifest($theme)));
        self::assertSame('theme.stale', $resolver->diagnostic(null)['code']);
        $manifest                    = $resolver->manifest($theme);
        $manifest['contractVersion'] = 0;
        self::assertSame('theme.stale', $resolver->diagnostic($manifest)['code']);
        $this->localTheme();
        self::assertSame('theme.stale', $resolver->diagnostic($resolver->manifest($theme))['code']);
    }

    public function testInvalidJsonDoesNotExposeFilesystemPaths(): void
    {
        file_put_contents($this->root . '/site/site.json', '{');
        try {
            $this->resolver()->resolve();
            self::fail('Invalid JSON must fail.');
        } catch (ThemeException $exception) {
            self::assertStringContainsString('theme.invalid', $exception->getMessage());
            self::assertStringNotContainsString($this->root, $exception->getMessage());
        }
    }

    public function testScalarThemeIsNotSilentlyDefaulted(): void
    {
        $this->write('site/site.json', ['theme' => 'default']);
        $this->expectExceptionMessage('theme.invalid');
        $this->resolver()->resolve();
    }

    public function testSymlinkCannotEscapeThemeDirectory(): void
    {
        $this->localTheme();
        unlink($this->root . '/site/theme/index.tsx');
        symlink($this->root . '/engine/resources/js/Themes/default/index.tsx', $this->root . '/site/theme/index.tsx');
        $this->expectExceptionMessage('theme.invalid');
        $this->resolver()->resolve();
    }

    public function testConsumedExternalHelperAssetAndNpmModuleInvalidateManifest(): void
    {
        $this->localTheme();
        $this->write('site/node_modules/helper/package.json', ['name' => 'helper', 'version' => '1']);
        $files = [
            'site/shared.js'                    => 'export const value = 1;',
            'site/asset.svg'                    => '<svg/>',
            'site/node_modules/helper/index.js' => 'export const value = 2;',
        ];
        foreach ($files as $path => $source) {
            file_put_contents($this->root . '/' . $path, $source);
        }
        $resolver = $this->resolver();
        $paths    = array_map(fn (string $path): string => $this->root . '/' . $path, array_keys($files));
        $manifest = $resolver->manifest($resolver->resolve(), $paths);
        self::assertNull($resolver->diagnostic($manifest));
        foreach ($files as $path => $source) {
            file_put_contents($this->root . '/' . $path, $source . ' changed');
            self::assertSame('theme.stale', $resolver->diagnostic($manifest)['code'] ?? null, $path);
            file_put_contents($this->root . '/' . $path, $source);
            self::assertNull($resolver->diagnostic($manifest));
        }
        self::assertStringNotContainsString($this->root, json_encode($manifest));
    }

    public function testLegacyManifestRequiresRebuildAndInputReferencesStayInsideRoots(): void
    {
        $resolver                  = $this->resolver();
        $manifest                  = $resolver->manifest($resolver->resolve());
        $manifest['schemaVersion'] = 1;
        self::assertSame('theme.stale', $resolver->diagnostic($manifest)['code']);
        foreach (["file:engine:bad\0.js", 'file:engine:../outside.js', 'file:unknown:entry.js'] as $reference) {
            $manifest           = $resolver->manifest($resolver->resolve());
            $manifest['inputs'] = [$reference => 'invalid'];
            self::assertSame('theme.stale', $resolver->diagnostic($manifest)['code']);
        }
    }

    public function testInstalledDependencyAliasAndRuntimeCacheDoNotCauseFalseStale(): void
    {
        $this->localTheme();
        $this->write('deps/dependency/package.json', ['name' => 'dependency', 'version' => '1']);
        file_put_contents($this->root . '/deps/dependency/index.js', 'export const value = 1;');
        $this->write('engine/local/plugins/example/package.json', ['name' => 'example']);
        file_put_contents($this->root . '/engine/local/plugins/example/index.js', "import 'dependency';");
        symlink($this->root . '/deps', $this->root . '/engine/local/plugins/node_modules');
        $resolver = $this->resolver();
        $manifest = $resolver->manifest($resolver->resolve(), [
            $this->root . '/engine/local/plugins/example/index.js',
            $this->root . '/deps/dependency/index.js',
        ]);
        self::assertNull($resolver->diagnostic($manifest));
        mkdir($this->root . '/engine/local/cache', 0775, true);
        file_put_contents($this->root . '/engine/local/cache/container.php', '<?php // runtime');
        self::assertNull($resolver->diagnostic($manifest));
        file_put_contents($this->root . '/deps/dependency/index.js', 'export const value = 2;');
        self::assertSame('theme.stale', $resolver->diagnostic($manifest)['code']);
    }

    public function testNulEntryFailsWithSafeThemeDiagnostic(): void
    {
        $this->localTheme();
        $this->write('site/theme/theme.json', ['contractVersion' => 1, 'entry' => "bad\0.tsx"]);
        $diagnostic = $this->resolver()->diagnostic(null);
        self::assertSame('theme.invalid', $diagnostic['code']);
        self::assertStringNotContainsString($this->root, $diagnostic['message']);
        $this->expectException(ThemeException::class);
        $this->resolver()->resolve();
    }

    public function testDeclaredDirectoryCapturesNestedContentsAndExactInventories(): void
    {
        $this->localTheme();
        $this->write('site/data/nested/input.json', ['value' => 1]);
        $this->write('site/data/.cache/input.json', ['value' => 1]);
        symlink($this->root . '/site/data', $this->root . '/site/data/loop');
        symlink($this->root . '/site/data', $this->root . '/site/data-alias');
        $resolver = $this->resolver();
        $theme    = $resolver->resolve();
        $manifest = $resolver->manifest($theme, [$this->root . '/site/data-alias']);
        self::assertNull($resolver->diagnostic($manifest));
        self::assertArrayHasKey('watchdir:site:data', $manifest['inputs']);
        self::assertArrayHasKey('file:site:data/.cache/input.json', $manifest['inputs']);
        foreach (['nested', '.cache'] as $directory) {
            $this->write('site/data/' . $directory . '/input.json', ['value' => 2]);
            self::assertSame('theme.stale', $resolver->diagnostic($manifest)['code']);
            self::assertNull($resolver->diagnostic($resolver->manifest($theme, [$this->root . '/site/data'])));
            $this->write('site/data/' . $directory . '/input.json', ['value' => 1]);
            self::assertNull($resolver->diagnostic($manifest));
        }
        $this->write('site/data/added/deep.json', ['added' => true]);
        self::assertSame('theme.stale', $resolver->diagnostic($manifest)['code']);
        self::assertNull($resolver->diagnostic($resolver->manifest($theme, [$this->root . '/site/data'])));
        unlink($this->root . '/site/data/added/deep.json');
        rmdir($this->root . '/site/data/added');
        self::assertNull($resolver->diagnostic($manifest));
        unlink($this->root . '/site/data/nested/input.json');
        self::assertSame('theme.stale', $resolver->diagnostic($manifest)['code']);
        self::assertNull($resolver->diagnostic($resolver->manifest($theme, [$this->root . '/site/data'])));
        $this->write('site/data/nested/input.json', ['value' => 1]);
        self::assertNull($resolver->diagnostic($manifest));
        self::assertStringNotContainsString($this->root, json_encode($manifest));
    }

    public function testDeclaredDirectoryRejectsEscapingSymlink(): void
    {
        $this->localTheme();
        $this->write('site/data/input.json', []);
        $this->write('outside/input.json', []);
        symlink($this->root . '/outside', $this->root . '/site/data/escape');
        $this->expectException(ThemeException::class);
        $this->expectExceptionMessage('theme.invalid');
        $resolver = $this->resolver();
        $resolver->manifest($resolver->resolve(), [$this->root . '/site/data']);
    }

    public function testMissingDeclaredInputIsRejectedInsteadOfIgnored(): void
    {
        $this->expectException(ThemeException::class);
        $this->expectExceptionMessage('theme.invalid');
        $resolver = $this->resolver();
        $resolver->manifest($resolver->resolve(), [$this->root . '/site/missing']);
    }

    public function testDeclaredAliasRetargetsWithSameContentsAndWarmWorker(): void
    {
        $this->localTheme();
        $this->write('site/targets/a/input.json', ['value' => 1]);
        $this->write('site/targets/b/input.json', ['value' => 1]);
        mkdir($this->root . '/site/aliases/deep', 0775, true);
        symlink($this->root . '/site', $this->root . '/mounted-site');
        $link = $this->root . '/site/aliases/deep/live';
        symlink('../../targets/a', $link);
        $resolver = new ThemeResolver($this->root . '/engine', $this->root . '/mounted-site');
        foreach (['', '/input.json'] as $suffix) {
            $path     = $this->root . '/mounted-site/aliases/deep/live' . $suffix;
            $original = $resolver->manifest($resolver->resolve(), [$path]);
            self::assertArrayHasKey('resolve:site:aliases/deep/live' . $suffix, $original['inputs']);
            self::assertNull($resolver->diagnostic($original));
            // External mutation must not be hidden by the worker realpath cache.
            $switch = static function (string $target) use ($link): void {
                $process = proc_open([PHP_BINARY, '-r', 'unlink($argv[1]); symlink($argv[2], $argv[1]);', $link, $target], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
                self::assertIsResource($process);
                foreach ($pipes as $pipe) {
                    fclose($pipe);
                }
                self::assertSame(0, proc_close($process));
            };
            $switch('../../targets/b');
            self::assertSame('theme.stale', $resolver->diagnostic($original)['code']);
            $changed = $resolver->manifest($resolver->resolve(), [$path]);
            self::assertNotSame($original['fingerprint'], $changed['fingerprint'], 'Identity changes even with equal file contents.');
            self::assertNull($resolver->diagnostic($changed));
            $switch('../../targets/a');
            self::assertSame('theme.stale', $resolver->diagnostic($changed)['code']);
            self::assertNull($resolver->diagnostic($original));
            $switch($this->root . '/site/targets/a');
            self::assertSame('theme.stale', $resolver->diagnostic($original)['code'], 'Link identity changes even with the same canonical target.');
            $switch('../../targets/a');
            self::assertNull($resolver->diagnostic($original));
            self::assertStringNotContainsString($this->root, json_encode($changed));
        }
    }

    public function testSharedCanonicalDirectoryKeepsEachNestedAliasResolution(): void
    {
        $this->localTheme();
        $this->write('site/targets/a/input.json', ['value' => 1]);
        $this->write('site/targets/b/input.json', ['value' => 2]);
        mkdir($this->root . '/site/watched', 0775, true);
        mkdir($this->root . '/site/hops', 0775, true);
        symlink('../targets/a', $this->root . '/site/watched/first');
        symlink('../hops/middle', $this->root . '/site/watched/second');
        symlink('../targets/a', $this->root . '/site/hops/middle');
        $resolver = $this->resolver();
        $path     = $this->root . '/site/watched';
        $original = $resolver->manifest($resolver->resolve(), [$path]);
        self::assertArrayHasKey('resolve:site:watched/first', $original['inputs']);
        self::assertArrayHasKey('resolve:site:watched/second', $original['inputs']);
        self::assertNull($resolver->diagnostic($original));
        unlink($this->root . '/site/hops/middle');
        symlink('../targets/b', $this->root . '/site/hops/middle');
        self::assertSame('theme.stale', $resolver->diagnostic($original)['code']);
        $changed = $resolver->manifest($resolver->resolve(), [$path]);
        self::assertNull($resolver->diagnostic($changed));
        unlink($this->root . '/site/hops/middle');
        symlink('../targets/a', $this->root . '/site/hops/middle');
        self::assertSame('theme.stale', $resolver->diagnostic($changed)['code']);
        self::assertNull($resolver->diagnostic($original));
    }

    public function testRetargetedAliasCannotHideMissingOrExternalInput(): void
    {
        $this->localTheme();
        $this->write('site/targets/a/input.json', ['value' => 1]);
        $this->write('outside/input.json', ['value' => 2]);
        mkdir($this->root . '/site/aliases/deep', 0775, true);
        $link = $this->root . '/site/aliases/deep/live';
        symlink('../../targets/a', $link);
        $resolver = $this->resolver();
        $manifest = $resolver->manifest($resolver->resolve(), [$link]);
        foreach ([$this->root . '/missing', $this->root . '/outside'] as $target) {
            unlink($link);
            symlink($target, $link);
            self::assertNotNull($resolver->diagnostic($manifest));
            self::assertStringNotContainsString($this->root, json_encode($resolver->diagnostic($manifest)));
            try {
                $resolver->manifest($resolver->resolve(), [$link]);
                self::fail('Invalid alias must be rejected.');
            } catch (ThemeException $exception) {
                self::assertStringStartsWith('theme.invalid:', $exception->getMessage());
                self::assertStringNotContainsString($this->root, $exception->getMessage());
            }
        }
        unlink($link);
        symlink('../../targets/a', $link);
        self::assertNull($resolver->diagnostic($manifest));
    }

    private function resolver(): ThemeResolver
    {
        return new ThemeResolver($this->root . '/engine', $this->root . '/site');
    }

    private function localTheme(): void
    {
        $this->write('site/site.json', ['theme' => ['id' => 'local']]);
        $this->write('site/theme/theme.json', ['contractVersion' => 1, 'entry' => 'index.tsx']);
        file_put_contents($this->root . '/site/theme/index.tsx', 'export default {}');
    }

    private function write(string $path, array $value): void
    {
        $path = $this->root . '/' . $path;
        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0775, true);
        }
        file_put_contents($path, json_encode($value, JSON_THROW_ON_ERROR));
    }
}
