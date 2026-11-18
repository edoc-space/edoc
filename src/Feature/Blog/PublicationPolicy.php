<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use DateTimeImmutable;

final readonly class PublicationPolicy
{
    public function __construct(
        public bool $enabled,
        public DateTimeImmutable $now,
    ) {
    }

    /** @param array{date:?DateTimeImmutable,draft:bool} $article */
    public function visible(array $article): bool
    {
        return $this->enabled && !$article['draft'] && $article['date'] !== null && $article['date'] <= $this->now;
    }
}
