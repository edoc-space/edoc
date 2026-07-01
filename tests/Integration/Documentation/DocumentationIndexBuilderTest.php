<?php

declare(strict_types=1);

namespace App\Tests\Integration\Documentation;

use App\Feature\Documentation\DocumentationIndexBuilder;
use App\Feature\Documentation\DocumentationStorage;
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
final class DocumentationIndexBuilderTest extends IntegrationTestCase
{
    public function testInvalidCategoryJsonAddsDiagnostic(): void
    {
        [$builder, $root] = $this->builderWith([
            'project/index.json' => '{',
            'project/intro.md'   => <<<'MD'
                ---
                title: Intro
                slug: project/intro
                ---

                # Intro
                MD,
        ]);

        try {
            $index = $builder->build();

            $this->assertContains('category.invalid_json', array_column($index['diagnostics'], 'code'));
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testDuplicateSlugAddsDiagnostic(): void
    {
        [$builder, $root] = $this->builderWith([
            'first.md' => <<<'MD'
                ---
                title: First
                slug: same
                ---

                # First
                MD,
            'second.md' => <<<'MD'
                ---
                title: Second
                slug: same
                ---

                # Second
                MD,
        ]);

        try {
            $index = $builder->build();

            $this->assertContains('slug.duplicate', array_column($index['diagnostics'], 'code'));
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testCategoryMetadataControlsSidebarsAndGeneratedIndexPages(): void
    {
        [$builder, $root] = $this->builderWith([
            'project/index.json' => <<<'JSON'
                {
                  "label": "Project",
                  "position": 2,
                  "description": "Project docs",
                  "sidebar": true,
                  "expanded": false,
                  "link": {
                    "type": "generated-index"
                  },
                  "redirects": [
                    {
                      "from": "old-setup",
                      "to": "setup.md"
                    },
                    {
                      "from": "/docs/legacy/project-intro",
                      "to": "/docs/project/intro#usage"
                    }
                  ]
                }
                JSON,
            'api/index.json' => <<<'JSON'
                {
                  "label": "API",
                  "position": 1,
                  "description": "API docs",
                  "sidebar": true,
                  "expanded": true,
                  "link": {
                    "type": "generated-index"
                  }
                }
                JSON,
            'project/setup.md' => <<<'MD'
                ---
                title: Setup
                slug: project/setup
                sidebar_position: 1
                ---

                # Setup
                MD,
            'project/intro.md' => <<<'MD'
                ---
                title: Intro
                slug: project/intro
                sidebar_position: 2
                ---

                # Intro
                MD,
        ]);

        try {
            $index = $builder->build();

            $this->assertSame(['API', 'Project'], array_column($index['sidebars'], 'label'));
            $this->assertSame('/docs/api', $index['sidebars'][0]['href'] ?? null);
            $this->assertSame('Project docs', $index['categories']['project']['description'] ?? null);
            $this->assertTrue($index['categories']['project']['collapsed'] ?? false);
            $this->assertFalse($index['categories']['project']['expanded'] ?? true);
            $this->assertArrayHasKey('project', $index['pages']);
            $this->assertSame(['Setup', 'Intro'], array_column($index['categories']['project']['children'] ?? [], 'label'));
            $this->assertSame('/docs/project/setup', $index['redirects']['project/old-setup']['to'] ?? null);
            $this->assertSame(301, $index['redirects']['project/old-setup']['status'] ?? null);
            $this->assertSame('/docs/project/intro#usage', $index['redirects']['legacy/project-intro']['to'] ?? null);
            $this->assertContains('Project', array_column($index['search_entries'], 'title'));
            $this->assertContains('Setup', array_column($index['search_entries'], 'title'));
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testMdxSearchContextsSkipImportsAndJsxScaffolding(): void
    {
        [$builder, $root] = $this->builderWith([
            'project/index.json' => <<<'JSON'
                {
                  "label": "Project",
                  "link": {
                    "type": "generated-index"
                  }
                }
                JSON,
            'project/plugins.mdx' => <<<'MDX'
                ---
                title: Plugins
                slug: project/plugins
                ---

                import {
                  OpenApi,
                  Changelog,
                } from '@edoc/plugin-openapi'

                <OpenApi
                  source="/storage/edoc/static/examples/openapi.json"
                />

                <Section title="Plugin API">
                  Важный текст внутри MDX-блока должен попадать в поиск.
                </Section>
                MDX,
        ]);

        try {
            $index = $builder->build();
            $entry = null;
            foreach ($index['search_entries'] as $candidate) {
                if (($candidate['href'] ?? null) === '/docs/project/plugins') {
                    $entry = $candidate;
                    break;
                }
            }

            $this->assertNotNull($entry);
            $this->assertStringNotContainsString('import', $entry['content'] ?? '');
            $this->assertStringNotContainsString('OpenApi', $entry['content'] ?? '');
            $this->assertContains('Важный текст внутри MDX блока должен попадать в поиск.', $entry['contexts'] ?? []);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testLocalizedIndexReadsOnlyRequestedLocaleContent(): void
    {
        [$builder, $root] = $this->localizedBuilderWith([
            'site.json' => <<<'JSON'
                {
                  "default_locale": "en",
                  "locales": [
                    { "code": "en", "label": "English" },
                    { "code": "ru", "label": "Русский", "path": "/ru" }
                  ]
                }
                JSON,
            'en/docs/start.md' => <<<'MD'
                ---
                title: English start
                slug: start
                translation_key: start
                ---

                # English start
                MD,
            'docs/root-only.md' => <<<'MD'
                ---
                title: Root only
                slug: root-only
                ---

                # Root only
                MD,
            'ru/docs/start.md' => <<<'MD'
                ---
                title: Russian start
                slug: start
                translation_key: start
                ---

                # Russian start
                MD,
        ]);

        try {
            $defaultIndex = $builder->build();
            $ruIndex      = $builder->build('ru');

            $this->assertSame('/docs/start', $defaultIndex['pages']['start']['href'] ?? null);
            $this->assertSame('English start', $defaultIndex['pages']['start']['title'] ?? null);
            $this->assertArrayNotHasKey('root-only', $defaultIndex['pages']);

            $this->assertSame('/ru/docs/start', $ruIndex['pages']['start']['href'] ?? null);
            $this->assertSame('Russian start', $ruIndex['pages']['start']['title'] ?? null);
            $this->assertArrayNotHasKey('root-only', $ruIndex['pages']);
            $this->assertSame([
                ['locale' => 'en', 'href' => '/docs/start'],
                ['locale' => 'ru', 'href' => '/ru/docs/start'],
                ['locale' => 'x-default', 'href' => '/docs/start'],
            ], $builder->alternateLinks($ruIndex['pages']['start']));
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testVersionedDocsUseOverridesAndFrontMatterWindow(): void
    {
        [$builder, $root] = $this->builderWith([
            'versions.json' => <<<'JSON'
                {
                  "current": "1.2.0",
                  "versions": [
                    { "version": "1.2.0", "label": "1.2.0", "status": "current" },
                    { "version": "1.1.0", "label": "1.1.0", "status": "supported" },
                    { "version": "1.0.0", "label": "1.0.0", "status": "archived" }
                  ]
                }
                JSON,
            'project/index.json' => <<<'JSON'
                {
                  "label": "Project",
                  "link": {
                    "type": "generated-index"
                  }
                }
                JSON,
            'project/shared.md' => <<<'MD'
                ---
                title: Shared current
                slug: project/shared
                ---

                # Shared current
                MD,
            'project/new.md' => <<<'MD'
                ---
                title: New page
                slug: project/new
                since: 1.2.0
                ---

                # New page
                MD,
            'versioned_docs/1.1.0/overrides/project/shared.md' => <<<'MD'
                ---
                title: Shared 1.1
                slug: project/shared
                ---

                # Shared 1.1
                MD,
        ]);

        try {
            $current = $builder->build();
            $v11     = $builder->build(null, '1.1.0');
            $archive = $builder->build(null, '1.0.0');

            $this->assertTrue($current['versions']['enabled'] ?? false);
            $this->assertSame('1.2.0', $current['versions']['selected']['version'] ?? null);
            $this->assertSame('/docs/project/shared', $current['pages']['project/shared']['href'] ?? null);
            $this->assertSame('Shared current', $current['pages']['project/shared']['title'] ?? null);
            $this->assertArrayHasKey('project/new', $current['pages']);

            $this->assertSame('1.1.0', $v11['versions']['selected']['version'] ?? null);
            $this->assertSame('Shared 1.1', $v11['pages']['project/shared']['title'] ?? null);
            $this->assertSame('/docs/v/1.1.0/project/shared', $v11['pages']['project/shared']['href'] ?? null);
            $this->assertSame('/docs/v/1.1.0/project', $v11['pages']['project']['href'] ?? null);
            $this->assertSame('versioned_docs/1.1.0/overrides/project/shared.md', $v11['pages']['project/shared']['storage_path'] ?? null);
            $this->assertArrayNotHasKey('project/new', $v11['pages']);
            $this->assertNotContains('New page', array_column($v11['search_entries'], 'title'));

            $this->assertSame('archived', $archive['versions']['selected']['status'] ?? null);
            $this->assertSame([], $archive['tree']);
            $this->assertSame([], $archive['search_entries']);
        } finally {
            $this->removeDirectory($root);
        }
    }

    /**
     * @param array<string,string> $files
     * @return array{0:DocumentationIndexBuilder,1:string}
     */
    private function builderWith(array $files): array
    {
        $root = sys_get_temp_dir() . '/edoc-docs-' . bin2hex(random_bytes(6));
        mkdir($root, 0775, true);

        foreach ($files as $path => $contents) {
            $this->writeFile($root, $path, $contents);
        }

        $storage = new Storage([
            'default' => DocumentationStorage::DOCS_DISK,
            'disks'   => [
                DocumentationStorage::DOCS_DISK => [
                    'driver'   => 'local',
                    'rootPath' => $root,
                ],
                DocumentationStorage::STATIC_DISK => [
                    'driver'   => 'local',
                    'rootPath' => $root . '/static',
                ],
            ],
        ]);

        return [new DocumentationIndexBuilder($storage), $root];
    }

    /**
     * @param array<string,string> $files
     * @return array{0:DocumentationIndexBuilder,1:string}
     */
    private function localizedBuilderWith(array $files): array
    {
        $root = sys_get_temp_dir() . '/edoc-docs-' . bin2hex(random_bytes(6));
        mkdir($root, 0775, true);

        foreach ($files as $path => $contents) {
            $this->writeFile($root, $path, $contents);
        }

        $storage = new Storage([
            'default' => SiteStorage::SITE_DISK,
            'disks'   => [
                SiteStorage::SITE_DISK => [
                    'driver'   => 'local',
                    'rootPath' => $root,
                    'baseUrl'  => '/storage/edoc',
                ],
                DocumentationStorage::DOCS_DISK => [
                    'driver'   => 'local',
                    'rootPath' => $root . '/docs',
                ],
                DocumentationStorage::STATIC_DISK => [
                    'driver'   => 'local',
                    'rootPath' => $root . '/static',
                ],
            ],
        ]);

        return [new DocumentationIndexBuilder($storage), $root];
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
