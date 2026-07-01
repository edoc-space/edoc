<?php

declare(strict_types=1);

use PhpSoftBox\TestUtils\Fixture\FixtureRunner;

use function PhpSoftBox\Container\factory;

return [
    FixtureRunner::class => factory(static fn (): FixtureRunner => new FixtureRunner()),
];
