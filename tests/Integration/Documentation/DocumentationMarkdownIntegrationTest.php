<?php

declare(strict_types=1);

namespace App\Tests\Integration\Documentation;

use App\Feature\Content\ContentRendererInterface;
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
use function array_map;
use function bin2hex;
use function dirname;
use function file_put_contents;
use function is_dir;
use function mkdir;
use function random_bytes;
use function rmdir;
use function substr_count;
use function sys_get_temp_dir;
use function unlink;

#[Group('integration')]
final class DocumentationMarkdownIntegrationTest extends IntegrationTestCase
{
    public function testRendererResolvesRelativeMarkdownLinksAndAssets(): void
    {
        [$documentation, $root] = $this->documentationWith([
            'guide/intro.md' => <<<'MD'
                ---
                title: Intro
                slug: guide/intro
                ---

                # Intro

                ## Links

                [Next](next.md#usage)

                ![Diagram](diagram.png)
                MD,
            'guide/next.md' => <<<'MD'
                ---
                title: Next
                slug: guide/next
                ---

                # Next

                ## Usage
                MD,
        ], [
            'guide/diagram.png' => 'image',
        ]);

        try {
            $view = $documentation->publicView('guide/intro');
            $html = (string) ($view['document']['html'] ?? '');

            $this->assertStringContainsString('href="/docs/guide/next#usage"', $html);
            $this->assertStringContainsString('src="/storage/edoc/static/guide/diagram.png"', $html);
            $this->assertSame([], array_column($view['diagnostics'], 'code'));
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testRendererExposesFrameworkAndResolverDiagnostics(): void
    {
        [$documentation, $root] = $this->documentationWith([
            'guide/broken.md' => <<<'MD'
                ---
                title: Broken
                slug: guide/broken
                ---

                # Broken

                [Missing](missing.md)

                ![Missing image](missing.png)

                <span>Raw HTML</span>
                MD,
        ]);

        try {
            $view  = $documentation->publicView('guide/broken');
            $codes = array_column($view['diagnostics'], 'code');

            $this->assertContains('link.unresolved', $codes);
            $this->assertContains('asset.unresolved', $codes);
            $this->assertContains('html.disallowed', $codes);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testFrameworkMarkdownFeaturesReachDocumentationPayload(): void
    {
        [$documentation, $root] = $this->documentationWith([
            'guide/features.md' => <<<'MD'
                ---
                title: Features
                slug: guide/features
                ---

                # Features

                ## Usage

                ### Step

                :::warning
                Be careful.
                :::

                ```php title="bootstrap.php"
                echo "ok";
                ```
                MD,
        ]);

        try {
            $view  = $documentation->publicView('guide/features');
            $html  = (string) ($view['document']['html'] ?? '');
            $toc   = $view['toc'];
            $codes = array_column($view['diagnostics'], 'code');

            $this->assertSame(['Usage', 'Step'], array_column($toc, 'title'));
            $this->assertSame([2, 3], array_map(static fn (array $item): int => (int) $item['level'], $toc));
            $this->assertStringContainsString('markdown-admonition--warning', $html);
            $this->assertStringContainsString('class="markdown-code__title"', $html);
            $this->assertStringContainsString('bootstrap.php', $html);
            $this->assertStringContainsString('data-language="php"', $html);
            $this->assertSame([], $codes);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testRendererDecoratesMarkdownImageGalleries(): void
    {
        [$documentation, $root] = $this->documentationWith([
            'guide/gallery.md' => <<<'MD'
                ---
                title: Gallery
                slug: guide/gallery
                ---

                # Gallery

                ![Single](single_hor.jpg)

                ::: gallery install
                ![Step 1](install-1_hor.jpg "First step")
                :::

                Text between screenshots.

                :::gallery install
                ![Step 2](install-2_ver.jpg)
                ![Step 3](install-3_hor.jpg)
                :::

                ::: gallery after_install
                ![Done](done_hor.jpg)
                :::
                MD,
        ], [
            'guide/single_hor.jpg'    => 'single',
            'guide/install-1_hor.jpg' => 'step-1',
            'guide/install-2_ver.jpg' => 'step-2',
            'guide/install-3_hor.jpg' => 'step-3',
            'guide/done_hor.jpg'      => 'done',
        ]);

        try {
            $view  = $documentation->publicView('guide/gallery');
            $html  = (string) ($view['document']['html'] ?? '');
            $codes = array_column($view['diagnostics'], 'code');

            $this->assertStringNotContainsString('::: gallery', $html);
            $this->assertSame(2, substr_count($html, 'data-gallery="install"'));
            $this->assertSame(1, substr_count($html, 'data-gallery="after_install"'));
            $this->assertStringContainsString('src="/storage/edoc/static/guide/single_hor.jpg"', $html);
            $this->assertStringContainsString('src="/storage/edoc/static/guide/install-1_hor.jpg"', $html);
            $this->assertStringContainsString('title="First step"', $html);
            $this->assertSame([], $codes);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testRendererEmbedsAllowedVideoDirectives(): void
    {
        [$documentation, $root] = $this->documentationWith([
            'guide/video.md' => <<<'MD'
                ---
                title: Video
                slug: guide/video
                ---

                # Video

                ::: video youtube
                https://www.youtube.com/watch?v=dQw4w9WgXcQ
                title="YouTube overview"
                :::

                :::video rutube 0123456789abcdef0123456789abcdef
                :::

                ::: video vkvideo
                <iframe src="https://vkvideo.ru/video_ext.php?oid=-123&id=456&hd=3" width="1280" height="720"></iframe>
                :::

                ::: video vkvideo
                https://vkvideo.ru/video-239594766_456239018
                title="VK direct link"
                :::
                MD,
        ]);

        try {
            $view  = $documentation->publicView('guide/video');
            $html  = (string) ($view['document']['html'] ?? '');
            $codes = array_column($view['diagnostics'], 'code');

            $this->assertStringNotContainsString('::: video', $html);
            $this->assertStringContainsString('data-provider="youtube"', $html);
            $this->assertStringContainsString('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', $html);
            $this->assertStringContainsString('YouTube overview', $html);
            $this->assertStringContainsString('data-provider="rutube"', $html);
            $this->assertStringContainsString('https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef', $html);
            $this->assertStringContainsString('data-provider="vkvideo"', $html);
            $this->assertStringContainsString('data-video-src="https://vkvideo.ru/video_ext.php?oid=-123&amp;id=456&amp;hd=3"', $html);
            $this->assertStringContainsString('href="https://vkvideo.ru/video-239594766_456239018"', $html);
            $this->assertStringContainsString('Для встраивания VK Video используйте src из iframe', $html);
            $this->assertSame([], $codes);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testMdxDocumentExposesTocFromMarkdownHeadings(): void
    {
        [$documentation, $root] = $this->documentationWith([
            'guide/mdx.mdx' => <<<'MDX'
                ---
                title: MDX
                slug: guide/mdx
                ---

                import { DirectoryTree } from '@edoc-space/plugin-directory-tree'

                # pages: отдельные страницы

                ## `pages`: отдельные страницы

                <DirectoryTree tree={[]} />

                ```md
                ## Ignored
                ```

                ### [Ссылка](next.md)

                ## `pages`: отдельные страницы
                MDX,
        ]);

        try {
            $view = $documentation->publicView('guide/mdx');
            $toc  = $view['toc'];

            $this->assertSame(['pages: отдельные страницы', 'Ссылка', 'pages: отдельные страницы'], array_column($toc, 'title'));
            $this->assertSame([2, 3, 2], array_map(static fn (array $item): int => (int) $item['level'], $toc));
            $this->assertSame(['pages-отдельные-страницы-2', 'ссылка', 'pages-отдельные-страницы-3'], array_column($toc, 'id'));
            $this->assertSame('mdx', $view['document']['format'] ?? null);
        } finally {
            $this->removeDirectory($root);
        }
    }

    public function testMarkdownEscapesComponentLikeHtml(): void
    {
        [$documentation, $root] = $this->documentationWith([
            'guide/component-like-html.md' => <<<'MD'
                ---
                title: Component-like HTML
                slug: guide/component-like-html
                ---

                # Component-like HTML

                <Hero title="Docs">
                Hero content.
                </Hero>
                MD,
        ]);

        try {
            $view  = $documentation->publicView('guide/component-like-html');
            $html  = (string) ($view['document']['html'] ?? '');
            $codes = array_column($view['diagnostics'], 'code');

            $this->assertStringContainsString('&lt;Hero title="Docs"&gt;', $html);
            $this->assertStringContainsString('&lt;/Hero&gt;', $html);
            $this->assertContains('html.disallowed', $codes);
        } finally {
            $this->removeDirectory($root);
        }
    }

    /**
     * @param array<string,string> $documents
     * @param array<string,string> $staticFiles
     * @return array{0:DocumentationRepository,1:string}
     */
    private function documentationWith(array $documents, array $staticFiles = []): array
    {
        $root       = sys_get_temp_dir() . '/edoc-docs-' . bin2hex(random_bytes(6));
        $docsRoot   = $root . '/docs';
        $staticRoot = $root . '/static';

        mkdir($docsRoot, 0775, true);
        mkdir($staticRoot, 0775, true);

        foreach ($documents as $path => $contents) {
            $this->writeFile($docsRoot, $path, $contents);
        }

        foreach ($staticFiles as $path => $contents) {
            $this->writeFile($staticRoot, $path, $contents);
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
