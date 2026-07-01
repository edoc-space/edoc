<?php

declare(strict_types=1);

namespace App\Feature\Page;

final class PageStorage
{
    public const PAGES_DISK  = 'edoc_pages';
    public const STATIC_DISK = 'edoc_static';

    private function __construct()
    {
    }
}
