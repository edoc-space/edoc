<?php

declare(strict_types=1);

namespace App\Tests\Support;

use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;

abstract class IntegrationTestCase extends TestCase
{
    private static ?ContainerInterface $container = null;

    protected static function container(): ContainerInterface
    {
        if (self::$container === null) {
            self::$container = require __DIR__ . '/../../config/container.php';
        }

        return self::$container;
    }
}
