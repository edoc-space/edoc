<?php

declare(strict_types=1);

namespace App\Tests\Unit\Feature\Plugin;

use App\Feature\Plugin\PluginInstaller;
use App\Path;
use PHPUnit\Framework\TestCase;
use RuntimeException;

use function bin2hex;
use function dirname;
use function file_get_contents;
use function file_put_contents;
use function is_dir;
use function json_decode;
use function mkdir;
use function random_bytes;
use function sys_get_temp_dir;

use const JSON_THROW_ON_ERROR;

final class PluginInstallerTest extends TestCase
{
    public function testGeneratesLocalPluginPackageFromManifest(): void
    {
        $root = $this->tempRoot();
        $this->write($root . '/local/storage/edoc/plugins.json', <<<'JSON'
            {
              "dependencies": {
                "@edoc-space/plugin-openapi": "^1.0.0",
                "@edoc-space/plugin-changelog": "^1.0.0"
              },
              "optionalDependencies": {
                "@edoc-space/plugin-directory-tree": "^1.0.0"
              },
              "resolutions": {
                "react-icons": "^5.7.0"
              }
            }
            JSON);

        $installer = new PluginInstaller(new Path($root));

        $result = $installer->install(runInstall: false);

        $package = json_decode((string) file_get_contents($result->packagePath), true, 512, JSON_THROW_ON_ERROR);

        self::assertFalse($result->installed);
        self::assertSame([
            '@edoc-space/plugin-openapi',
            '@edoc-space/plugin-changelog',
            '@edoc-space/plugin-directory-tree',
        ], $result->dependencies);
        self::assertSame('edoc-local-plugins', $package['name'] ?? null);
        self::assertTrue($package['private'] ?? false);
        self::assertSame('module', $package['type'] ?? null);
        self::assertSame('^1.0.0', $package['dependencies']['@edoc-space/plugin-openapi'] ?? null);
        self::assertSame('^1.0.0', $package['dependencies']['@edoc-space/plugin-changelog'] ?? null);
        self::assertSame('^1.0.0', $package['optionalDependencies']['@edoc-space/plugin-directory-tree'] ?? null);
        self::assertSame('^5.7.0', $package['resolutions']['react-icons'] ?? null);
    }

    public function testMissingManifestGeneratesEmptyPackage(): void
    {
        $root = $this->tempRoot();

        $installer = new PluginInstaller(new Path($root));

        $result = $installer->install(runInstall: false);

        $package = json_decode((string) file_get_contents($result->packagePath), true, 512, JSON_THROW_ON_ERROR);

        self::assertSame([], $result->dependencies);
        self::assertSame('edoc-local-plugins', $package['name'] ?? null);
        self::assertArrayNotHasKey('dependencies', $package);
    }

    public function testInvalidPackageNameFails(): void
    {
        $root = $this->tempRoot();
        $this->write($root . '/local/storage/edoc/plugins.json', <<<'JSON'
            {
              "dependencies": {
                "../bad": "^1.0.0"
              }
            }
            JSON);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Invalid plugin package name');

        new PluginInstaller(new Path($root))->install(runInstall: false);
    }

    private function tempRoot(): string
    {
        $root = sys_get_temp_dir() . '/edoc-plugin-installer-' . bin2hex(random_bytes(6));
        mkdir($root, 0775, true);

        return $root;
    }

    private function write(string $path, string $contents): void
    {
        $directory = dirname($path);
        if (!is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        file_put_contents($path, $contents);
    }
}
