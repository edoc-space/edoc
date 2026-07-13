<?php

declare(strict_types=1);

namespace App\Tests\Integration\Page;

use App\Feature\Page\PageException;
use App\Feature\Page\PageRepository;
use App\Tests\Support\IntegrationTestCase;
use PHPUnit\Framework\Attributes\Group;

use function array_column;

#[Group('integration')]
final class PageRepositoryTest extends IntegrationTestCase
{
    public function testHomePageRendersFromPagesIndex(): void
    {
        $view = self::container()->get(PageRepository::class)->publicView(null);

        $this->assertSame('E-Doc', $view['current']['title'] ?? null);
        $this->assertSame('/', $view['current']['href'] ?? null);
        $this->assertSame('home', $view['current']['layout'] ?? null);
        $this->assertSame('fluid', $view['current']['container'] ?? null);
        $this->assertSame('mdx', $view['document']['format'] ?? null);
        $this->assertSame('/local/storage/edoc/en/pages/index.mdx', $view['document']['module'] ?? null);
        $this->assertContains('Home', array_column($view['navigation'], 'label'));
        $this->assertContains('Changelog', array_column($view['navigation'], 'label'));
    }

    public function testSecondaryPageRendersBySlug(): void
    {
        $view = self::container()->get(PageRepository::class)->publicView('changelog');

        $this->assertSame('Changelog', $view['current']['title'] ?? null);
        $this->assertSame('/changelog', $view['current']['href'] ?? null);
        $this->assertSame('page', $view['document']['kind'] ?? null);
        $this->assertSame([], array_column($view['diagnostics'], 'code'));
    }

    public function testUnknownPageReturnsNotFound(): void
    {
        $this->expectException(PageException::class);

        self::container()->get(PageRepository::class)->publicView('missing');
    }
}
