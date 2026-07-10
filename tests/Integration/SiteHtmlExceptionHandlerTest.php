<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Feature\Site\SiteLocaleResolver;
use App\Http\Exception\SiteHtmlExceptionHandler;
use App\Tests\Support\IntegrationTestCase;
use PhpSoftBox\Application\Exception\NotFoundHttpException;
use PhpSoftBox\Http\Message\ServerRequest;
use PhpSoftBox\Inertia\Inertia;
use PHPUnit\Framework\Attributes\Group;
use RuntimeException;

#[Group('integration')]
final class SiteHtmlExceptionHandlerTest extends IntegrationTestCase
{
    public function testNotFoundUsesInertiaErrorPageWithoutTrace(): void
    {
        $handler = new SiteHtmlExceptionHandler(
            self::container()->get(Inertia::class),
            self::container()->get(SiteLocaleResolver::class),
            includeDetails: true,
        );

        $response = $handler->handle(
            new NotFoundHttpException('Missing route'),
            new ServerRequest('GET', 'https://example.test/missing'),
        );

        $html = (string) $response->getBody();

        self::assertSame(404, $response->getStatusCode());
        self::assertSame('X-Inertia', $response->getHeaderLine('Vary'));
        self::assertStringContainsString('Web/Error/Show', $html);
        self::assertStringContainsString('/images/404.png', $html);
        self::assertStringContainsString('&quot;status&quot;:404', $html);
        self::assertStringNotContainsString('Missing route', $html);
        self::assertStringNotContainsString('error-details', $html);
    }

    public function testServerErrorUsesInertiaErrorPageWithoutTrace(): void
    {
        $handler = new SiteHtmlExceptionHandler(
            self::container()->get(Inertia::class),
            self::container()->get(SiteLocaleResolver::class),
            includeDetails: false,
        );

        $response = $handler->handle(
            new RuntimeException('Sensitive production exception'),
            new ServerRequest('GET', 'https://example.test/docs'),
        );

        $html = (string) $response->getBody();

        self::assertSame(500, $response->getStatusCode());
        self::assertStringContainsString('Web/Error/Show', $html);
        self::assertStringContainsString('/images/500.png', $html);
        self::assertStringContainsString('&quot;status&quot;:500', $html);
        self::assertStringNotContainsString('Sensitive production exception', $html);
        self::assertStringNotContainsString('error-details', $html);
    }
}
