<?php

declare(strict_types=1);

namespace App\Tests\Integration\Fixture;

use App\Tests\Support\IntegrationTestCase;
use PhpSoftBox\TestUtils\Fixture\FixtureContext;
use PhpSoftBox\TestUtils\Fixture\FixtureInterface;
use PhpSoftBox\TestUtils\Fixture\FixtureRunner;
use PHPUnit\Framework\Attributes\Group;

#[Group('integration')]
final class FixtureRunnerIntegrationTest extends IntegrationTestCase
{
    public function testFixtureRunnerLoadsReferences(): void
    {
        $runner  = self::container()->get(FixtureRunner::class);
        $context = $runner->createContext();

        $fixture = new class () implements FixtureInterface {
            public function load(FixtureContext $context): void
            {
                $context->refs()->set('docs.demo', [
                    'slug'  => 'demo',
                    'title' => 'Demo',
                ]);
            }
        };

        $references = $runner->load($context, $fixture);

        $this->assertTrue($references->has('docs.demo'));
        $this->assertSame('Demo', $references->get('docs.demo')['title']);
    }
}
