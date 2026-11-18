<?php

declare(strict_types=1);

use App\Feature\Blog\BlogBuild;
use App\Feature\Blog\BlogRepository;
use App\Feature\Blog\Clock;
use App\Feature\Blog\LatestArticles;
use App\Feature\Blog\SystemClock;
use App\Feature\Site\SiteLocaleResolver;
use App\Feature\Theme\ThemeBuild;
use App\Path;
use PhpSoftBox\Config\Config;
use Psr\Container\ContainerInterface;

use function PhpSoftBox\Container\factory;

return [
    LatestArticles::class => factory(static fn (ContainerInterface $container): LatestArticles => new LatestArticles(
        $container->get(BlogRepository::class),
        $container->get(BlogBuild::class),
    )),
    Clock::class          => factory(static fn (): Clock => new SystemClock()),
    BlogRepository::class => factory(static function (ContainerInterface $container): BlogRepository {
        $root = $container->get(Path::class)->createPath((string) $container->get(Config::class)->get('storage.disks.edoc_site.rootPath', 'local/storage/edoc'));

        return new BlogRepository($root, $container->get(SiteLocaleResolver::class), $container->get(Clock::class));
    }),
    BlogBuild::class => factory(static function (ContainerInterface $container): BlogBuild {
        $path = $container->get(Path::class);

        return new BlogBuild($container->get(BlogRepository::class), $path->createPath(''), $path->createPath('local/build/blog'), $container->get(ThemeBuild::class));
    }),
];
