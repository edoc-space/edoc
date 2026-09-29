<?php

declare(strict_types=1);

namespace App\Tests\Integration\Site;

use App\Feature\Site\SeoMetaBuilder;
use PhpSoftBox\Application\Middleware\TrustedProxyMiddleware;
use PhpSoftBox\Config\Config;
use PhpSoftBox\Container\ContainerBuilder;
use PhpSoftBox\Http\Message\Response;
use PhpSoftBox\Http\Message\ServerRequest;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

#[CoversClass(SeoMetaBuilder::class)]
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

    /**
     * Поддельные forwarded-заголовки не меняют канонический адрес страницы.
     *
     * @see SeoMetaBuilder::links()
     */
    public function testIgnoresUntrustedForwardedHeaders(): void
    {
        $request = new ServerRequest('GET', 'http://127.0.0.1/docs')
            ->withHeader('X-Forwarded-Proto', 'https')
            ->withHeader('X-Forwarded-Host', 'docs.example.com');

        $meta = new SeoMetaBuilder()->links($request, 'ru/docs/start');

        $this->assertSame('http://127.0.0.1/ru/docs/start', $meta['canonical']);
    }

    /**
     * Каноническая ссылка использует внешний адрес только от настроенного прокси.
     *
     * @see SeoMetaBuilder::links()
     */
    #[DataProvider('proxyOrigins')]
    public function testBuildsCanonicalAfterConfiguredProxyMiddleware(string $remoteAddress, string $expected): void
    {
        $builder = new ContainerBuilder();

        $builder->addDefinitions(require __DIR__ . '/../../../config/definitions/trusted-proxy.php');
        $builder->addDefinitions([
            Config::class => new Config([['app' => ['trusted_proxies' => ['192.0.2.10']]]]),
        ]);
        $middleware = $builder->build()->get(TrustedProxyMiddleware::class);
        $request    = new ServerRequest('GET', 'http://backend:8080/docs', serverParams: ['REMOTE_ADDR' => $remoteAddress])
            ->withHeader('X-Forwarded-Proto', 'https')
            ->withHeader('X-Forwarded-Host', 'docs.example.com')
            ->withHeader('X-Forwarded-Port', '443');

        $handler = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return new Response(body: new SeoMetaBuilder()->links($request, '/docs/start')['canonical']);
            }
        };

        $response = $middleware->process($request, $handler);

        $this->assertSame($expected, (string) $response->getBody());
    }

    public static function proxyOrigins(): array
    {
        return [
            'доверенный прокси' => ['192.0.2.10', 'https://docs.example.com/docs/start'],
            'прямой запрос'     => ['192.0.2.20', 'http://backend:8080/docs/start'],
        ];
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
