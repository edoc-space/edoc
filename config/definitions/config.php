<?php

declare(strict_types=1);

use PhpSoftBox\Config\Config;
use PhpSoftBox\Config\ConfigFactory;
use PhpSoftBox\Config\Provider\PhpFileDataProvider;
use PhpSoftBox\Encryptor\Contracts\EncryptedValueResolverInterface;
use Psr\Container\ContainerInterface;

use function PhpSoftBox\Container\factory;

return [
    ConfigFactory::class => factory(static function (ContainerInterface $container): ConfigFactory {
        $env       = env('APP_ENV', 'dev');
        $baseDir   = dirname(__DIR__, 2);
        $configDir = $baseDir . '/config/app';
        $resolver  = $container->has(EncryptedValueResolverInterface::class)
            ? $container->get(EncryptedValueResolverInterface::class)
            : null;

        return new ConfigFactory(
            baseDir: $baseDir,
            env: $env,
            encryptedValueResolver: $resolver,
            providers: [
                new PhpFileDataProvider($configDir . '/*.php'),
                new PhpFileDataProvider($configDir . '/' . $env . '/*.php'),
            ],
        );
    }),

    Config::class => factory(static fn (ContainerInterface $container): Config => $container->get(ConfigFactory::class)->create()),
];
