<?php

declare(strict_types=1);

namespace App\Tests\Integration\Site;

use App\Feature\Site\SiteConfigRepository;
use App\Feature\Site\SiteStorage;
use App\Tests\Support\IntegrationTestCase;
use FilesystemIterator;
use PhpSoftBox\Storage\Storage;
use PHPUnit\Framework\Attributes\Group;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

use function array_column;
use function bin2hex;
use function dirname;
use function file_put_contents;
use function is_dir;
use function mkdir;
use function random_bytes;
use function rmdir;
use function sys_get_temp_dir;
use function unlink;

#[Group('integration')]
final class SiteConfigRepositoryTest extends IntegrationTestCase
{
    public function testDefaultSiteConfigExpandsPagesAndDocsNavigation(): void
    {
        $shared = self::container()->get(SiteConfigRepository::class)->sharedData(
            pages: [
                ['title' => 'E-Doc', 'label' => 'Home', 'href' => '/'],
                ['title' => 'Changelog', 'label' => 'Changelog', 'href' => '/changelog'],
                ['title' => 'Help Center', 'label' => 'Help Center', 'href' => '/help', 'header_hidden' => true],
            ],
            docs: [
                ['title' => 'Project', 'label' => 'Project', 'href' => '/docs/project'],
                ['title' => 'API', 'label' => 'API', 'href' => '/docs/api'],
            ],
        );

        $this->assertSame('E-Doc', $shared['site']['title'] ?? null);
        $this->assertSame('/storage/edoc/static/logo.svg', $shared['site']['brand']['logo']['src'] ?? null);
        $this->assertSame(['Home', 'Changelog', 'Docs'], array_column($shared['navigation'], 'label'));
        $this->assertSame(['Site', 'Documentation'], array_column($shared['footer']['columns'], 'title'));
        $this->assertSame(['Home', 'Changelog', 'Help Center'], array_column($shared['footer']['columns'][0]['items'], 'label'));
        $this->assertSame('© 2026 E-Doc. Documentation as code.', $shared['footer']['copyright'] ?? null);
        $this->assertSame([], array_column($shared['diagnostics'], 'code'));
    }

    public function testSiteConfigSupportsManualNavigationAndFooterItems(): void
    {
        [$repository, $root] = $this->repositoryWith(<<<'JSON'
            {
              "title": "Docs Portal",
              "brand": {
                "name": "Portal",
                "href": "/",
                "logo": {
                  "src": "brand/logo.svg",
                  "alt": "Portal logo"
                }
              },
              "navigation": [
                { "label": "Start", "href": "/" },
                { "source": "docs" },
                { "label": "GitHub", "href": "https://example.test/repo" }
              ],
              "footer": {
                "copyright": "Docs Portal",
                "columns": [
                  {
                    "title": "Docs",
                    "source": "docs"
                  },
                  {
                    "title": "Links",
                    "items": [
                      { "label": "Repository", "href": "https://example.test/repo" }
                    ]
                  }
                ]
              }
            }
            JSON, [
                'brand/logo.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
            ]);

        try {
            $shared = $repository->sharedData(
                pages: [
                    ['title' => 'Home', 'label' => 'Home', 'href' => '/'],
                ],
                docs: [
                    ['title' => 'API', 'label' => 'API', 'href' => '/docs/api'],
                ],
            );

            $this->assertSame('Docs Portal', $shared['site']['title'] ?? null);
            $this->assertSame('Portal', $shared['site']['brand']['name'] ?? null);
            $this->assertSame('/storage/edoc/static/brand/logo.svg', $shared['site']['brand']['logo']['src'] ?? null);
            $this->assertSame('Portal logo', $shared['site']['brand']['logo']['alt'] ?? null);
            $this->assertSame(['Start', 'API', 'GitHub'], array_column($shared['navigation'], 'label'));
            $this->assertSame(['Docs', 'Links'], array_column($shared['footer']['columns'], 'title'));
            $this->assertSame('Docs Portal', $shared['footer']['copyright'] ?? null);
            $this->assertSame('Repository', $shared['footer']['columns'][1]['items'][0]['label'] ?? null);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testInvalidSiteJsonAddsDiagnosticAndKeepsDefaults(): void
    {
        [$repository, $root] = $this->repositoryWith('{');

        try {
            $shared = $repository->sharedData(
                pages: [
                    ['title' => 'Home', 'label' => 'Home', 'href' => '/'],
                ],
                docs: [],
            );

            $this->assertSame('E-Doc', $shared['site']['title'] ?? null);
            $this->assertSame(['Home'], array_column($shared['navigation'], 'label'));
            $this->assertContains('site.invalid_json', array_column($shared['diagnostics'], 'code'));
        } finally {
            $this->removeDirectory($root);
        }
    }

    /**
     * @return array{0:SiteConfigRepository,1:string}
     * @param array<string,string> $staticFiles
     */
    private function repositoryWith(string $siteConfig, array $staticFiles = []): array
    {
        $root = sys_get_temp_dir() . '/edoc-site-' . bin2hex(random_bytes(6));
        mkdir($root, 0775, true);
        file_put_contents($root . '/site.json', $siteConfig);

        foreach ($staticFiles as $path => $contents) {
            $this->writeFile($root . '/static', $path, $contents);
        }

        $storage = new Storage([
            'default' => SiteStorage::SITE_DISK,
            'disks'   => [
                SiteStorage::SITE_DISK => [
                    'driver'   => 'local',
                    'rootPath' => $root,
                ],
                SiteStorage::STATIC_DISK => [
                    'driver'   => 'local',
                    'rootPath' => $root . '/static',
                    'baseUrl'  => '/storage/edoc/static',
                ],
            ],
        ]);

        return [new SiteConfigRepository($storage), $root];
    }

    private function writeFile(string $root, string $path, string $contents): void
    {
        $fullPath = $root . '/' . $path;
        $dir      = dirname($fullPath);

        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        file_put_contents($fullPath, $contents);
    }

    private function removeDirectory(string $path): void
    {
        if (!is_dir($path)) {
            return;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST,
        );

        foreach ($iterator as $item) {
            if (!$item instanceof SplFileInfo) {
                continue;
            }

            if ($item->isDir()) {
                rmdir($item->getPathname());
                continue;
            }

            unlink($item->getPathname());
        }

        rmdir($path);
    }
}
