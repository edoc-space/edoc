<?php

declare(strict_types=1);

namespace App\Tests\Integration\Documentation;

use App\Feature\Content\ContentRendererInterface;
use App\Feature\Documentation\DocumentationException;
use App\Feature\Documentation\DocumentationIndexBuilder;
use App\Feature\Documentation\DocumentationNavigation;
use App\Feature\Documentation\DocumentationRenderer;
use App\Feature\Documentation\DocumentationRepository;
use App\Feature\Documentation\DocumentationStorage;
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
final class DocumentationRepositoryTest extends IntegrationTestCase
{
    public function testDocsRootCanBeEmpty(): void
    {
        [$documentation, $root] = $this->documentationWith();

        try {
            $view = $documentation->publicView(null);

            $this->assertSame([], $view['sidebars']);
            $this->assertNull($view['active_sidebar']);
            $this->assertSame([], $view['tree']);
            $this->assertNull($view['current']);
            $this->assertNull($view['document']);
            $this->assertSame([], $view['search']);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testRedirectForReturnsNullWithoutDocumentation(): void
    {
        [$documentation, $root] = $this->documentationWith();

        try {
            $redirect = $documentation->redirectFor('project/bystryj-start/pervyj-dokument');

            $this->assertNull($redirect);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testNotFoundViewKeepsEmptyDocumentationNavigation(): void
    {
        [$documentation, $root] = $this->documentationWith();

        try {
            $view = $documentation->notFoundView('project/missing-page');

            $this->assertNull($view['current']);
            $this->assertNull($view['document']);
            $this->assertSame('project/missing-page', $view['not_found']['slug'] ?? null);
            $this->assertNull($view['active_sidebar']);
            $this->assertSame([], $view['tree']);
            $this->assertSame([], $view['search']);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testUnknownSlugReturnsNotFound(): void
    {
        [$documentation, $root] = $this->documentationWith();

        $this->expectException(DocumentationException::class);

        try {
            $documentation->publicView('unknown');
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testPublicViewKeepsFullTreeWhenSectionIsActive(): void
    {
        [$documentation, $root] = $this->documentationWith([
            'start/index.json' => <<<'JSON'
                {
                  "label": "Начало",
                  "position": 1,
                  "link": { "type": "generated-index" }
                }
                JSON,
            'content/index.json' => <<<'JSON'
                {
                  "label": "Контент",
                  "position": 2,
                  "link": { "type": "generated-index" }
                }
                JSON,
            'start/intro.md' => <<<'MD'
                ---
                title: Введение
                sidebar_position: 1
                ---

                # Введение
                MD,
            'content/model.md' => <<<'MD'
                ---
                title: Модель контента
                sidebar_position: 1
                ---

                # Модель контента
                MD,
        ]);

        try {
            $view = $documentation->publicView('content/model');

            $this->assertSame('Контент', $view['active_sidebar']['label'] ?? null);
            $this->assertSame(['Начало', 'Контент'], array_column($view['tree'], 'label'));
            $this->assertSame(['Введение'], array_column($view['tree'][0]['children'] ?? [], 'label'));
            $this->assertSame(['Модель контента'], array_column($view['tree'][1]['children'] ?? [], 'label'));
        } finally {
            $this->removeDirectory($root);
        }
    }

    /**
     * @param array<string,string> $documents
     * @return array{0:DocumentationRepository,1:string}
     */
    private function documentationWith(array $documents = []): array
    {
        $root       = sys_get_temp_dir() . '/edoc-docs-' . bin2hex(random_bytes(6));
        $docsRoot   = $root . '/docs';
        $staticRoot = $root . '/static';

        mkdir($docsRoot, 0775, true);
        mkdir($staticRoot, 0775, true);

        foreach ($documents as $path => $contents) {
            $this->writeFile($docsRoot, $path, $contents);
        }

        $storage = new Storage([
            'default' => DocumentationStorage::DOCS_DISK,
            'disks'   => [
                DocumentationStorage::DOCS_DISK => [
                    'driver'   => 'local',
                    'rootPath' => $docsRoot,
                ],
                DocumentationStorage::STATIC_DISK => [
                    'driver'   => 'local',
                    'rootPath' => $staticRoot,
                    'baseUrl'  => '/storage/edoc/static',
                ],
            ],
        ]);

        return [
            new DocumentationRepository(
                new DocumentationIndexBuilder($storage),
                new DocumentationNavigation(),
                new DocumentationRenderer($storage, self::container()->get(ContentRendererInterface::class)),
            ),
            $root,
        ];
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
