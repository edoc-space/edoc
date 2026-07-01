<?php

declare(strict_types=1);

use App\Feature\Documentation\DocumentationRepository;
use App\Feature\Page\PageRepository;
use App\Feature\Site\SiteConfigRepository;
use App\Feature\Site\SiteLocaleResolver;
use App\Inertia\InertiaDataProvider;
use App\Inertia\WebSharedDataProvider;
use PhpSoftBox\Config\Config;
use PhpSoftBox\Config\Path\PathInterface;
use PhpSoftBox\Http\Message\ResponseFactory;
use PhpSoftBox\Http\Message\StreamFactory;
use PhpSoftBox\Inertia\Area\AreaSharedDataProviderRegistry;
use PhpSoftBox\Inertia\Inertia;
use PhpSoftBox\Inertia\InertiaConfig;
use PhpSoftBox\Inertia\Middleware\InertiaMiddleware;
use PhpSoftBox\Inertia\Middleware\InertiaShareMiddleware;
use PhpSoftBox\Inertia\Page\Breadcrumbs;
use PhpSoftBox\Inertia\Page\PageMeta;
use PhpSoftBox\Inertia\Share\SharedDataProviderInterface;
use PhpSoftBox\Inertia\Ssr\HttpSsrRenderer;
use PhpSoftBox\Inertia\Ssr\SsrRendererInterface;
use PhpSoftBox\Inertia\View\PhpViewRenderer;
use PhpSoftBox\Inertia\View\ViewRendererInterface;
use PhpSoftBox\Vite\Vite;
use Psr\Container\ContainerInterface;

use function PhpSoftBox\Container\factory;

return [
    InertiaConfig::class => factory(static function (ContainerInterface $container): InertiaConfig {
        $config = (array) $container->get(Config::class)->get('inertia', []);
        $path   = $container->get(PathInterface::class);

        $rootView = is_string($config['root_view'] ?? null) ? (string) $config['root_view'] : 'resources/views/app.php';
        $rootId   = is_string($config['root_id'] ?? null) ? (string) $config['root_id'] : 'app';
        $shared   = is_array($config['shared'] ?? null) ? $config['shared'] : [];

        $version = $config['version'] ?? null;
        if (!is_string($version) || $version === '') {
            $version = null;
        }

        if ($version === null && $container->has(Vite::class)) {
            $version = $container->get(Vite::class)->version();
        }

        $ssrEnabled = (bool) ($config['ssr'] ?? false);
        $areas      = is_array($config['areas'] ?? null) ? $config['areas'] : [];

        return new InertiaConfig(
            rootView: $path->createPath($rootView),
            rootId: $rootId,
            version: $version,
            shared: $shared,
            ssrEnabled: $ssrEnabled,
            areas: $areas,
        );
    }),

    ViewRendererInterface::class => factory(static function (ContainerInterface $container): ViewRendererInterface {
        $config = $container->get(InertiaConfig::class);
        $shared = [];

        if ($container->has(Vite::class)) {
            $shared['vite'] = $container->get(Vite::class);
        }

        return new PhpViewRenderer($config->rootView(), $config->rootId(), $shared);
    }),

    SsrRendererInterface::class => factory(static function (ContainerInterface $container): SsrRendererInterface {
        $vite = $container->get(Vite::class);

        return new HttpSsrRenderer(
            url: (string) ($vite->ssrUrl() ?? ''),
            timeout: $vite->ssrTimeout(),
        );
    }),

    Inertia::class => factory(static function (ContainerInterface $container): Inertia {
        return new Inertia(
            $container->get(InertiaConfig::class),
            $container->get(ViewRendererInterface::class),
            $container->get(ResponseFactory::class),
            $container->get(StreamFactory::class),
            $container->has(SsrRendererInterface::class) ? $container->get(SsrRendererInterface::class) : null,
            areaSharedDataProviders: $container->get(AreaSharedDataProviderRegistry::class),
        );
    }),

    InertiaMiddleware::class => factory(static function (ContainerInterface $container): InertiaMiddleware {
        return new InertiaMiddleware(
            $container->get(InertiaConfig::class),
            $container->get(ResponseFactory::class),
        );
    }),

    Breadcrumbs::class => factory(static fn (): Breadcrumbs => new Breadcrumbs()),
    PageMeta::class    => factory(static fn (): PageMeta => new PageMeta()),

    WebSharedDataProvider::class => factory(static function (ContainerInterface $container): WebSharedDataProvider {
        return new WebSharedDataProvider(
            $container->get(PageRepository::class),
            $container->get(DocumentationRepository::class),
            $container->get(SiteConfigRepository::class),
            $container->get(SiteLocaleResolver::class),
        );
    }),

    AreaSharedDataProviderRegistry::class => factory(static function (ContainerInterface $container): AreaSharedDataProviderRegistry {
        return new AreaSharedDataProviderRegistry([
            $container->get(WebSharedDataProvider::class),
        ]);
    }),

    SharedDataProviderInterface::class => factory(static function (ContainerInterface $container): SharedDataProviderInterface {
        return new InertiaDataProvider(
            null,
            $container->get(Breadcrumbs::class),
            $container->get(PageMeta::class),
        );
    }),

    InertiaShareMiddleware::class => factory(static function (ContainerInterface $container): InertiaShareMiddleware {
        return new InertiaShareMiddleware(
            $container->get(Inertia::class),
            $container->get(SharedDataProviderInterface::class),
        );
    }),
];
