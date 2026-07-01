<?php

declare(strict_types=1);

namespace App\Tests\Integration\Site;

use App\Feature\Site\SeoMetaBuilder;
use PhpSoftBox\Http\Message\ServerRequest;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;

#[Group('integration')]
final class SeoMetaBuilderTest extends TestCase
{
    public function testBuildsCanonicalFromCurrentRequestOrigin(): void
    {
        $request = new ServerRequest('GET', 'https://e-doc.local/docs?query=ignored');

        $meta = new SeoMetaBuilder()->links($request, '/docs/start');

        $this->assertSame('https://e-doc.local/docs/start', $meta['canonical']);
        $this->assertSame([], $meta['alternates']);
    }

    public function testBuildsCanonicalFromForwardedHeaders(): void
    {
        $request = new ServerRequest('GET', 'http://127.0.0.1/docs')
            ->withHeader('X-Forwarded-Proto', 'https')
            ->withHeader('X-Forwarded-Host', 'docs.example.com');

        $meta = new SeoMetaBuilder()->links($request, 'ru/docs/start');

        $this->assertSame('https://docs.example.com/ru/docs/start', $meta['canonical']);
    }

    public function testDoesNotLeakInternalProxyPortWhenHostHeaderHasNoPort(): void
    {
        $request = new ServerRequest('GET', 'https://e-doc.local:80/docs')
            ->withHeader('Host', 'e-doc.local');

        $meta = new SeoMetaBuilder()->links($request, '/docs/start');

        $this->assertSame('https://e-doc.local/docs/start', $meta['canonical']);
    }

    public function testNormalizesAlternateLinks(): void
    {
        $request = new ServerRequest('GET', 'https://example.com/docs/start');

        $meta = new SeoMetaBuilder()->links($request, '/docs/start', [
            ['locale' => 'en', 'href' => '/docs/start'],
            ['locale' => 'ru', 'href' => '/ru/docs/start'],
        ]);

        $this->assertSame([
            ['locale' => 'en', 'href' => 'https://example.com/docs/start'],
            ['locale' => 'ru', 'href' => 'https://example.com/ru/docs/start'],
        ], $meta['alternates']);
    }
}
