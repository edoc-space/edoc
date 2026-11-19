<?php

declare(strict_types=1);

use App\Feature\Theme\ThemeBuild;
use App\Feature\Theme\ThemeResolver;
use App\Http\Middleware\ThemeBuildMiddleware;
use App\Path;
use PhpSoftBox\Config\Config;
use Psr\Container\ContainerInterface;

use function PhpSoftBox\Container\factory;

return [
    ThemeResolver::class => factory(static function (ContainerInterface $container): ThemeResolver {
        $config = $container->get(Config::class);
        $path   = $container->get(Path::class);

        return new ThemeResolver(
            $path->createPath(''),
            $path->createPath((string) $config->get('storage.disks.edoc_site.rootPath', 'local/storage/edoc')),
        );
    }),
    ThemeBuild::class => factory(static function (ContainerInterface $container): ThemeBuild {
        $path     = $container->get(Path::class);
        $manifest = (string) $container->get(Config::class)->get('vite.manifest', 'public/build/.vite/manifest.json');

        return new ThemeBuild($container->get(ThemeResolver::class), dirname($path->createPath($manifest), 2) . '/theme.json');
    }),
    ThemeBuildMiddleware::class => factory(static fn (ContainerInterface $container): ThemeBuildMiddleware => new ThemeBuildMiddleware(
        $container->get(ThemeBuild::class),
        $container->get(Config::class)->get('app.env', 'dev') === 'prod',
    )),
];
