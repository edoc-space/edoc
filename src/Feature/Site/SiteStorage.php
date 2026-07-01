<?php

declare(strict_types=1);

namespace App\Feature\Site;

final class SiteStorage
{
    public const SITE_DISK   = 'edoc_site';
    public const STATIC_DISK = 'edoc_static';

    private function __construct()
    {
    }
}
