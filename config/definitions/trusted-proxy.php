<?php

declare(strict_types=1);

use PhpSoftBox\Application\Middleware\TrustedProxyMiddleware;
use PhpSoftBox\Config\Config;
use Psr\Container\ContainerInterface;

use function PhpSoftBox\Container\factory;

return [
    TrustedProxyMiddleware::class => factory(static fn (ContainerInterface $container): TrustedProxyMiddleware => new TrustedProxyMiddleware(
        trustedProxies: (array) $container->get(Config::class)->get('app.trusted_proxies', []),
    )),
];
