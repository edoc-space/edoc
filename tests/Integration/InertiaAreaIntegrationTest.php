<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Inertia\WebSharedDataProvider;
use App\Tests\Support\IntegrationTestCase;
use PhpSoftBox\Http\Message\ServerRequest;
use PhpSoftBox\Inertia\Area\AreaSharedDataProviderRegistry;
use PhpSoftBox\Inertia\InertiaConfig;
use PhpSoftBox\Router\RouteCollector;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\CoversMethod;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;

use function array_column;

#[Group('integration')]
#[CoversClass(InertiaConfig::class)]
#[CoversClass(AreaSharedDataProviderRegistry::class)]
#[CoversClass(WebSharedDataProvider::class)]
#[CoversClass(RouteCollector::class)]
#[CoversMethod(InertiaConfig::class, 'areas')]
#[CoversMethod(InertiaConfig::class, 'defaultArea')]
#[CoversMethod(InertiaConfig::class, 'ssrEnabled')]
#[CoversMethod(AreaSharedDataProviderRegistry::class, 'share')]
#[CoversMethod(WebSharedDataProvider::class, 'area')]
#[CoversMethod(WebSharedDataProvider::class, '__construct')]
#[CoversMethod(WebSharedDataProvider::class, 'share')]
#[CoversMethod(RouteCollector::class, 'getNamedRoutes')]
final class InertiaAreaIntegrationTest extends IntegrationTestCase
{
    /**
     * Проверяем, что AppBackend регистрирует web-only Inertia area с opt-in SSR.
     *
     * @see InertiaConfig::areas()
     * @see InertiaConfig::defaultArea()
     * @see InertiaConfig::ssrEnabled()
     */
    #[Test]
    public function testInertiaConfigDefinesWebArea(): void
    {
        $config = self::container()->get(InertiaConfig::class);
        $areas  = $config->areas();

        $this->assertFalse($config->ssrEnabled());
        $this->assertSame('web', $config->defaultArea());
        $this->assertArrayHasKey('web', $areas);
        $this->assertArrayNotHasKey('admin', $areas);
        $this->assertNull($areas['web']->ssr());
        $this->assertSame('web', $areas['web']->shared()['app']['area']);
    }

    /**
     * Проверяем, что area shared provider дополняет props для web области.
     *
     * @see AreaSharedDataProviderRegistry::share()
     * @see WebSharedDataProvider::share()
     */
    #[Test]
    public function testAreaSharedDataProvidersExposeNavigation(): void
    {
        $registry = self::container()->get(AreaSharedDataProviderRegistry::class);

        $web = $registry->share('web', new ServerRequest('GET', 'https://example.test/'));

        $this->assertContains('Home', array_column($web['web']['navigation'], 'label'));
        $this->assertContains('Plugins', array_column($web['web']['navigation'], 'label'));
        $this->assertContains('Changelog', array_column($web['web']['navigation'], 'label'));
        $this->assertContains('Docs', array_column($web['web']['navigation'], 'label'));
        $this->assertSame('E-Doc', $web['web']['site']['title'] ?? null);
        $this->assertSame(['Site', 'Documentation'], array_column($web['web']['footer']['columns'], 'title'));
        $this->assertContains('pages', array_column($web['web']['navigation'], 'source'));
        $this->assertNotContains('docs', array_column($web['web']['navigation'], 'source'));
    }

    /**
     * Проверяем, что AppBackend загружает только актуальные web маршруты.
     *
     * @see RouteCollector::getNamedRoutes()
     */
    #[Test]
    public function testRouteCollectorLoadsWebRoutes(): void
    {
        $routes = self::container()->get(RouteCollector::class);
        $named  = $routes->getNamedRoutes();

        $this->assertArrayHasKey('home', $named);
        $this->assertArrayHasKey('localized.ru.home', $named);
        $this->assertArrayHasKey('docs.search-index', $named);
        $this->assertArrayHasKey('localized.ru.docs.search-index', $named);
        $this->assertArrayHasKey('docs.show', $named);
        $this->assertArrayHasKey('localized.ru.docs.show', $named);
        $this->assertArrayHasKey('health', $named);
        $this->assertArrayHasKey('localized.ru.pages.show', $named);
        $this->assertArrayHasKey('pages.show', $named);
        $this->assertArrayNotHasKey('login', $named);
        $this->assertSame('/', $named['home']->path);
        $this->assertSame('/ru', $named['localized.ru.home']->path);
        $this->assertSame('/docs/search-index.json', $named['docs.search-index']->path);
        $this->assertSame('/ru/docs/search-index.json', $named['localized.ru.docs.search-index']->path);
        $this->assertSame('/docs/{path*?}', $named['docs.show']->path);
        $this->assertSame('/ru/docs/{path*?}', $named['localized.ru.docs.show']->path);
        $this->assertSame('/health', $named['health']->path);
        $this->assertSame('/ru/{path*}', $named['localized.ru.pages.show']->path);
        $this->assertSame('/{path*}', $named['pages.show']->path);
    }
}
