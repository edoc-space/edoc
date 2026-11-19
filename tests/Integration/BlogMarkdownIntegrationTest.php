<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Feature\Blog\BlogException;
use App\Feature\Blog\BlogMarkdownLinkResolver;
use App\Feature\Content\ContentRendererInterface;
use App\Feature\Content\ContentRenderOptions;
use App\Feature\Site\SiteLocale;
use App\Tests\Support\IntegrationTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

use function substr_count;

final class BlogMarkdownIntegrationTest extends IntegrationTestCase
{
    public function testFrameworkParsesReferenceAttachmentsAndResolvesLocalizedLinksAndToc(): void
    {
        $locale      = new SiteLocale('en', 'English', '/en', 'en', false);
        $attachments = [];
        $collector   = static function (string $target, string $source) use (&$attachments): string {
            $attachments[$target] = $source;

            return '/blog/_modules/generation/article/cover.svg';
        };
        $resolver = new BlogMarkdownLinkResolver($locale, 'en/blog/first.md', [
            'en/blog/second.mdx' => '/en/blog/second',
        ], [], $collector);

        $rendered = self::container()->get(ContentRendererInterface::class)->render(
            "## Heading\n\n![Private illustration][cover]\n\n[cover]: first/cover.svg\n\n[Next](second.mdx#details) [Page](../pages/about.md) [Docs](../docs/start/cache.md)\n",
            new ContentRenderOptions(path: 'en/blog/first.md', linkResolver: $resolver),
        );
        self::assertSame(['first/cover.svg' => 'en/blog/first/cover.svg'], $attachments);
        self::assertStringContainsString('/blog/_modules/generation/article/cover.svg', $rendered->html);
        self::assertStringContainsString('/en/blog/second#details', $rendered->html);
        self::assertStringContainsString('/en/about', $rendered->html);
        self::assertStringContainsString('/en/docs/start/cache', $rendered->html);
        self::assertSame('Heading', $rendered->toc[0]['title']);
    }

    public function testUnpreparedPrivateAttachmentFailsRatherThanBecomingPublicStatic(): void
    {
        $resolver = new BlogMarkdownLinkResolver(new SiteLocale('ru', 'Русский', '', 'ru', true), 'ru/blog/first.md', [], []);
        $this->expectException(BlogException::class);
        self::container()->get(ContentRendererInterface::class)->render('![Private](first/cover.svg)', new ContentRenderOptions(
            path: 'ru/blog/first.md',
            linkResolver: $resolver,
        ));
    }
    #[DataProvider('fragments')]
    public function testPreparedFragmentsUsePathKeyAndKeepSuffixForInlineAndReferenceSyntax(string $fragment, string $suffix): void
    {
        $url      = '/blog/_modules/generation/article/cover.svg';
        $resolver = new BlogMarkdownLinkResolver(new SiteLocale('ru', 'Русский', '', 'ru', true), 'ru/blog/first.md', [], [
            'first/cover.svg' => $url, 'first/notes.pdf' => '/blog/_modules/generation/article/notes.pdf',
        ]);

        $rendered = self::container()->get(ContentRendererInterface::class)->render(
            '![Inline](first/cover.svg#' . $fragment . ")\n\n![Reference][cover]\n\n[cover]: first/cover.svg#" . $fragment . "\n\n[PDF](first/notes.pdf#page=2)\n",
            new ContentRenderOptions(path: 'ru/blog/first.md', linkResolver: $resolver),
        );
        self::assertSame(2, substr_count($rendered->html, $url . '#' . $suffix));
        self::assertStringContainsString('/notes.pdf#page=2', $rendered->html);
        self::assertSame($url . '#' . $suffix, $resolver->resolveTarget('first/cover.svg#' . $fragment));
    }

    public static function fragments(): array
    {
        return [['review-fragment', 'review-fragment'], ['page=2', 'page=2'], ['review%20encoded', 'review%20encoded'], ['part%2520', 'part%2520']];
    }

    public function testEncodedTraversalIsStillRejectedWhenAFragmentIsPresent(): void
    {
        $resolver = new BlogMarkdownLinkResolver(new SiteLocale('ru', 'Русский', '', 'ru', true), 'ru/blog/first.md', [], []);
        $this->expectException(BlogException::class);
        $resolver->resolveTarget('first/%2e%2e/private.svg#page=2');
    }

}
