<?php

declare(strict_types=1);

use App\Path;
use PhpSoftBox\Profiler\Http\ProfilerReportHandler;
use PhpSoftBox\Profiler\Middleware\ProfilerMiddleware;
use PhpSoftBox\Profiler\Profiler;
use PhpSoftBox\Profiler\ProfilerInterface;
use PhpSoftBox\Profiler\ProfilerRegistry;
use PhpSoftBox\Profiler\ProfilerRegistryInterface;
use PhpSoftBox\Profiler\ProfilerStoreInterface;
use PhpSoftBox\Profiler\Store\FileProfilerStore;
use PhpSoftBox\Router\Profiler\RouterProfilerCollector;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;

use function PhpSoftBox\Container\factory;
use function PhpSoftBox\Container\get;

return [
    RouterProfilerCollector::class => factory(static fn (): RouterProfilerCollector => new RouterProfilerCollector()),

    ProfilerRegistryInterface::class => factory(static function (ContainerInterface $container): ProfilerRegistryInterface {
        $registry = new ProfilerRegistry();

        $registry->addCollector($container->get(RouterProfilerCollector::class));

        return $registry;
    }),

    ProfilerStoreInterface::class => factory(static function (ContainerInterface $container): ProfilerStoreInterface {
        return new FileProfilerStore($container->get(Path::class)->cachePath('profiler'));
    }),

    ProfilerInterface::class => factory(static function (ContainerInterface $container): ProfilerInterface {
        $enabled = (bool) filter_var(
            env('APP_PROFILER', env('APP_ENV', 'dev') === 'prod' ? '0' : '1'),
            FILTER_VALIDATE_BOOLEAN,
        );

        return new Profiler(
            enabled: $enabled,
            store: $container->get(ProfilerStoreInterface::class),
            registry: $container->get(ProfilerRegistryInterface::class),
        );
    }),

    ProfilerMiddleware::class => factory(static function (ContainerInterface $container): ProfilerMiddleware {
        return new ProfilerMiddleware($container->get(ProfilerInterface::class));
    }),

    ProfilerReportHandler::class => factory(static function (ContainerInterface $container): ProfilerReportHandler {
        return new ProfilerReportHandler(
            profiler: $container->get(ProfilerInterface::class),
            store: $container->get(ProfilerStoreInterface::class),
            responseFactory: $container->get(ResponseFactoryInterface::class),
            streamFactory: $container->get(StreamFactoryInterface::class),
        );
    }),

    Profiler::class => get(ProfilerInterface::class),
];
