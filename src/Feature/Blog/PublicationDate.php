<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;

use function array_column;
use function array_unique;
use function preg_match;
use function str_replace;
use function strlen;
use function substr;

final class PublicationDate
{
    public static function parse(string $value, string $timezone): DateTimeImmutable
    {
        $zone = new DateTimeZone($timezone);
        if (preg_match('/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?$/D', $value) !== 1) {
            throw new InvalidArgumentException('date must be an ISO date or date/time');
        }
        if (preg_match('/[+-](\d{2}):(\d{2})$/D', $value, $offset) && ((int) $offset[1] > 14 || (int) $offset[2] > 59 || ((int) $offset[1] === 14 && (int) $offset[2] !== 0))) {
            throw new InvalidArgumentException('invalid UTC offset');
        }
        $local = str_replace(' ', 'T', $value);
        if (strlen($local) === 10) {
            $local .= 'T00:00:00';
        }
        if (preg_match('/T\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}|$)/D', $local)) {
            $local = substr($local, 0, 16) . ':00' . substr($local, 16);
        }
        $explicit = preg_match('/(?:Z|[+-]\d{2}:\d{2})$/D', $local) === 1;
        $date     = DateTimeImmutable::createFromFormat($explicit ? '!Y-m-d\TH:i:sP' : '!Y-m-d\TH:i:s', $local, $zone);
        $errors   = DateTimeImmutable::getLastErrors();
        if ($date === false || ($errors !== false && ($errors['warning_count'] || $errors['error_count']))) {
            throw new InvalidArgumentException('invalid calendar date');
        }
        if (!$explicit) {
            // Count real instants mapping to the requested wall time. Zero is a
            // DST gap, two is an overlap; neither may silently pick an offset.
            $wall = new DateTimeImmutable($local, new DateTimeZone('UTC'))->getTimestamp();

            $offsets = array_unique(array_column($zone->getTransitions($wall - 172800, $wall + 172800) ?: [], 'offset'));
            $matches = 0;
            foreach ($offsets as $offset) {
                $candidate = new DateTimeImmutable('@' . ($wall - $offset))->setTimezone($zone);

                if ($candidate->format('Y-m-d\TH:i:s') === $local) {
                    ++$matches;
                }
            }
            if ($matches !== 1) {
                throw new InvalidArgumentException('nonexistent or ambiguous local date; specify an offset');
            }
        }

        return $date->setTimezone(new DateTimeZone('UTC'));
    }
}
