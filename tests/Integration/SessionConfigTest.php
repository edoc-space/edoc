<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use PhpSoftBox\Config\Config;
use PhpSoftBox\Container\ContainerBuilder;
use PhpSoftBox\Http\Message\ServerRequest;
use PhpSoftBox\Session\Config\SessionConfig;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\CoversMethod;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;

#[CoversClass(SessionConfig::class)]
#[CoversMethod(SessionConfig::class, 'secureFor')]
#[Group('integration')]
final class SessionConfigTest extends TestCase
{
    /**
     * Проверим настройку Secure cookie через определения контейнера для HTTP и HTTPS.
     *
     * @see SessionConfig::secureFor()
     */
    #[DataProvider('secureSettings')]
    public function testSecureCookiePolicyResolvesForRequest(array $settings, bool $httpSecure, bool $httpsSecure): void
    {
        $definitions                = require __DIR__ . '/../../config/definitions/session.php';
        $definitions[Config::class] = new Config([['session' => $settings]]);

        $config = new ContainerBuilder($definitions)->build()->get(SessionConfig::class);

        $this->assertSame($httpSecure, $config->secureFor(new ServerRequest('GET', 'http://localhost/')));
        $this->assertSame($httpsSecure, $config->secureFor(new ServerRequest('GET', 'https://localhost/')));
        $this->assertSame($httpsSecure, $config->secure);
    }

    public static function secureSettings(): iterable
    {
        yield 'default' => [[], true, true];
        yield 'always' => [['secure' => 'always'], true, true];
        yield 'never' => [['secure' => 'never'], false, false];
        yield 'auto' => [['secure' => 'auto'], false, true];
        yield 'boolean true' => [['secure' => true], true, true];
        yield 'boolean false' => [['secure' => false], false, false];
        yield 'integer one' => [['secure' => 1], true, true];
        yield 'integer zero' => [['secure' => 0], false, false];
        yield 'env one' => [['secure' => '1'], true, true];
        yield 'env zero' => [['secure' => '0'], false, false];
    }
}
