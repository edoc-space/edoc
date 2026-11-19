<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use RuntimeException;

final class BlogListException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
    ) {
        parent::__construct('Invalid blog selection');
    }
}
