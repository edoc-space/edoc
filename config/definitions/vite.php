<?php

declare(strict_types=1);

use PhpSoftBox\Config\Config;
use PhpSoftBox\Config\Path\PathInterface;
use PhpSoftBox\Vite\Vite;
use Psr\Container\ContainerInterface;

use function PhpSoftBox\Container\factory;

return [
    Vite::class => factory(static function (ContainerInterface $container): Vite {
        $config = (array) $container->get(Config::class)->get('vite', []);
        $path   = $container->get(PathInterface::class);

        $manifest  = is_string($config['manifest'] ?? null) ? (string) $config['manifest'] : 'public/build/manifest.json';
        $hotFile   = is_string($config['hot_file'] ?? null) ? (string) $config['hot_file'] : 'public/hot';
        $devServer = is_string($config['dev_server'] ?? null) ? (string) $config['dev_server'] : null;
        $buildBase = is_string($config['build_base'] ?? null) ? (string) $config['build_base'] : '/build';

        $ssrUrl     = is_string($config['ssr_url'] ?? null) ? (string) $config['ssr_url'] : null;
        $ssrEntry   = is_string($config['ssr_entry'] ?? null) ? (string) $config['ssr_entry'] : null;
        $ssrTimeout = is_numeric($config['ssr_timeout'] ?? null) ? (float) $config['ssr_timeout'] : 2.0;

        $env = $container->get(Config::class)->get('app.env', env('APP_ENV', 'dev'));
        $env = is_string($env) ? $env : 'dev';

        return new Vite(
            manifestPath: $path->createPath($manifest),
            hotFile: $path->createPath($hotFile),
            devServer: $devServer,
            environment: $env,
            buildBase: $buildBase,
            ssrUrl: $ssrUrl,
            ssrEntry: $ssrEntry,
            ssrTimeout: $ssrTimeout,
        );
    }),
];
