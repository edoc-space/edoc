<?php

declare(strict_types=1);

namespace App\Tests\Unit\Feature\Site;

use App\Feature\Site\SiteLocale;
use PHPUnit\Framework\TestCase;

final class SiteLocaleTest extends TestCase
{
    public function testUrlKeepsLocalizedPathIdempotent(): void
    {
        $locale = new SiteLocale(
            code: 'ru',
            label: 'Русский',
            urlPrefix: '/ru',
            contentPrefix: 'ru',
            default: false,
        );

        $this->assertSame('/ru', $locale->url('/'));
        $this->assertSame('/ru/docs', $locale->url('/docs'));
        $this->assertSame('/ru', $locale->url('/ru'));
        $this->assertSame('/ru/docs', $locale->url('/ru/docs'));
    }
}
