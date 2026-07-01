<?php

declare(strict_types=1);

use PhpSoftBox\Config\ConfigFactory;
use PhpSoftBox\Config\Provider\PhpFileDataProvider;

$env = $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? 'dev';

$factory = new ConfigFactory(
    env: $env,
    providers: [
        new PhpFileDataProvider(__DIR__ . '/definitions/*.php', keyByFilename: false),
        new PhpFileDataProvider(__DIR__ . '/definitions/' . $env . '/*.php', keyByFilename: false),
    ],
);

return $factory->getMergedConfig();
