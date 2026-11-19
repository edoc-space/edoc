<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use DateTimeImmutable;

interface Clock
{
    public function now(): DateTimeImmutable;
}
