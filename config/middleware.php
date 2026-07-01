<?php

declare(strict_types=1);

use PhpSoftBox\Application\Application;
use PhpSoftBox\Application\Middleware\BodyParserMiddleware;
use PhpSoftBox\Application\Middleware\CorsMiddleware;
use PhpSoftBox\Application\Middleware\MethodOverrideMiddleware;
use PhpSoftBox\Inertia\Middleware\InertiaMiddleware;
use PhpSoftBox\Inertia\Middleware\InertiaShareMiddleware;
use PhpSoftBox\Profiler\Middleware\ProfilerMiddleware;

return static function (Application $app): void {
    $app->middlewareGroup('api', [
        CorsMiddleware::class,
        BodyParserMiddleware::class,
    ]);

    $app->add(ProfilerMiddleware::class, priority: 1000);
    $app->add(MethodOverrideMiddleware::class);
    $app->add(BodyParserMiddleware::class);
    $app->add(CorsMiddleware::class);
    $app->add(InertiaShareMiddleware::class);
    $app->add(InertiaMiddleware::class);
};
