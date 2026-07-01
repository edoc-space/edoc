<?php

declare(strict_types=1);

namespace App\Feature\Documentation;

final class DocumentationStorage
{
    public const DOCS_DISK   = 'edoc_docs';
    public const STATIC_DISK = 'edoc_static';

    private function __construct()
    {
    }
}
