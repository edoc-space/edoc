<?php

declare(strict_types=1);

use PhpSoftBox\Config\Config;
use PhpSoftBox\Cookie\SameSite;
use PhpSoftBox\Session\CookieSecurePolicy;
use PhpSoftBox\Session\NativeSessionStore;
use PhpSoftBox\Session\Session;
use PhpSoftBox\Session\SessionConfig;
use PhpSoftBox\Session\SessionInterface;
use PhpSoftBox\Session\SessionStoreInterface;
use Psr\Container\ContainerInterface;

use function PhpSoftBox\Container\factory;

return [
    SessionConfig::class => factory(static function (ContainerInterface $container): SessionConfig {
        $config = (array) $container->get(Config::class)->get('session', []);

        $sameSite      = SameSite::Lax;
        $sameSiteValue = $config['same_site'] ?? null;
        if (is_string($sameSiteValue)) {
            $sameSiteValue = strtolower(trim($sameSiteValue));
            $sameSite      = match ($sameSiteValue) {
                'strict' => SameSite::Strict,
                'none'   => SameSite::None,
                default  => SameSite::Lax,
            };
        }

        $isSecureSession = $config['secure'] ?? null;
        if (is_numeric($isSecureSession)) {
            $securePolicy = CookieSecurePolicy::fromBoolean((bool) $isSecureSession);
        } else {
            $securePolicy = CookieSecurePolicy::from($config['secure'] ?? 'always');
        }
        $lifetime      = (int) ($config['lifetime'] ?? 0);
        $gcMaxLifetime = $config['gc_max_lifetime'] ?? null;
        $gcMaxLifetime = is_numeric($gcMaxLifetime) ? (int) $gcMaxLifetime : null;

        return new SessionConfig(
            name: (string) ($config['name'] ?? 'psb_session'),
            lifetime: $lifetime,
            path: (string) ($config['path'] ?? '/'),
            domain: is_string($config['domain'] ?? null) ? $config['domain'] : null,
            secure: $securePolicy->resolve(),
            httpOnly: (bool) ($config['http_only'] ?? true),
            sameSite: $sameSite,
            useStrictMode: (bool) ($config['use_strict_mode'] ?? true),
            useOnlyCookies: (bool) ($config['use_only_cookies'] ?? true),
            useCookies: (bool) ($config['use_cookies'] ?? true),
            gcMaxLifetime: $gcMaxLifetime,
            securePolicy: $securePolicy,
        );
    }),

    SessionStoreInterface::class => factory(static function (ContainerInterface $container): SessionStoreInterface {
        return new NativeSessionStore($container->get(SessionConfig::class));
    }),

    SessionInterface::class => factory(static function (ContainerInterface $container): SessionInterface {
        return new Session($container->get(SessionStoreInterface::class));
    }),
];
