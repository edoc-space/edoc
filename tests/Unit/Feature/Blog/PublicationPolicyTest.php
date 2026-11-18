<?php

declare(strict_types=1);

namespace App\Tests\Unit\Feature\Blog;

use App\Feature\Blog\PublicationDate;
use App\Feature\Blog\PublicationPolicy;
use DateTimeImmutable;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

use function sprintf;

final class PublicationPolicyTest extends TestCase
{
    public function testBoundaryUsesOneInstantAndDraftAlwaysWins(): void
    {
        $date = PublicationDate::parse('2026-11-13T12:00:00Z', 'UTC');
        foreach ([-1 => false, 0 => true, 1 => true] as $seconds => $expected) {
            $policy = new PublicationPolicy(true, $date->modify(sprintf('%+d seconds', $seconds)));

            self::assertSame($expected, $policy->visible(['date' => $date, 'draft' => false]));
            self::assertFalse($policy->visible(['date' => $date, 'draft' => true]));
        }
        self::assertFalse(new PublicationPolicy(false, new DateTimeImmutable('2030-01-01Z'))->visible(['date' => $date, 'draft' => false]));
    }

    public function testDateOnlyAndExplicitOffsetAreIndependentOfHostZone(): void
    {
        self::assertSame('2026-03-28T23:00:00+00:00', PublicationDate::parse('2026-03-29', 'Europe/Amsterdam')->format('c'));
        self::assertSame('2026-10-25T00:30:00+00:00', PublicationDate::parse('2026-10-25T02:30:00+02:00', 'Europe/Amsterdam')->format('c'));
    }

    public function testNonexistentLocalTimeIsRejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        PublicationDate::parse('2026-03-29T02:30:00', 'Europe/Amsterdam');
    }

    public function testAmbiguousLocalTimeRequiresOffset(): void
    {
        $this->expectException(InvalidArgumentException::class);
        PublicationDate::parse('2026-10-25T02:30:00', 'Europe/Amsterdam');
    }

    public function testInvalidCalendarDateIsRejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        PublicationDate::parse('2026-02-30', 'UTC');
    }
}
