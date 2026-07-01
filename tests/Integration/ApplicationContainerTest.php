<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Feature\Content\ContentRendererInterface;
use App\Feature\Content\MarkdownContentRenderer;
use App\Feature\Documentation\DocumentationIndexBuilder;
use App\Feature\Documentation\DocumentationNavigation;
use App\Feature\Documentation\DocumentationRenderer;
use App\Feature\Documentation\DocumentationRepository;
use App\Feature\Documentation\Query\ReadPublicDocumentation\ReadPublicDocumentationHandler;
use App\Feature\Page\PageRepository;
use App\Feature\Page\Query\ReadPublicPage\ReadPublicPageHandler;
use App\Feature\Site\SiteConfigRepository;
use App\Tests\Support\IntegrationTestCase;
use PhpSoftBox\Markdown\MarkdownRenderer;
use PhpSoftBox\Storage\Contracts\StorageInterface;
use PhpSoftBox\TestUtils\Fixture\FixtureRunner;
use PHPUnit\Framework\Attributes\Group;

#[Group('integration')]
final class ApplicationContainerTest extends IntegrationTestCase
{
    public function testContainerResolvesApplicationServices(): void
    {
        $container = self::container();

        $this->assertInstanceOf(FixtureRunner::class, $container->get(FixtureRunner::class));
        $this->assertInstanceOf(StorageInterface::class, $container->get(StorageInterface::class));
        $this->assertInstanceOf(MarkdownRenderer::class, $container->get(MarkdownRenderer::class));
        $this->assertInstanceOf(MarkdownContentRenderer::class, $container->get(ContentRendererInterface::class));
        $this->assertInstanceOf(DocumentationIndexBuilder::class, $container->get(DocumentationIndexBuilder::class));
        $this->assertInstanceOf(DocumentationNavigation::class, $container->get(DocumentationNavigation::class));
        $this->assertInstanceOf(DocumentationRenderer::class, $container->get(DocumentationRenderer::class));
        $this->assertInstanceOf(DocumentationRepository::class, $container->get(DocumentationRepository::class));
        $this->assertInstanceOf(ReadPublicDocumentationHandler::class, $container->get(ReadPublicDocumentationHandler::class));
        $this->assertInstanceOf(PageRepository::class, $container->get(PageRepository::class));
        $this->assertInstanceOf(ReadPublicPageHandler::class, $container->get(ReadPublicPageHandler::class));
        $this->assertInstanceOf(SiteConfigRepository::class, $container->get(SiteConfigRepository::class));
    }

    public function testStorageUsesLocalStorageDirectory(): void
    {
        $storage = self::container()->get(StorageInterface::class);
        $path    = 'tests/storage-check.txt';

        try {
            $storage->put($path, 'ok');

            $this->assertTrue($storage->exists($path));
            $this->assertSame('ok', $storage->read($path));
            $this->assertSame('/storage/tests/storage-check.txt', $storage->url($path));
        } finally {
            $storage->delete($path);
        }
    }
}
