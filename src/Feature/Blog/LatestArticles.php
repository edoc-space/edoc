<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use App\Feature\Site\SiteLocale;

use function array_map;
use function array_slice;
use function is_array;
use function is_int;

/** Explicit page opt-in. Visibility and ordering always belong to BlogRepository. */
final readonly class LatestArticles
{
    public function __construct(
        private BlogRepository $repository,
        private ?BlogBuild $build = null,
    ) {
    }

    /** @return array{latestArticles?:array{enabled:bool,items:list<array<string,mixed>>}} */
    public function props(mixed $config, SiteLocale $locale): array
    {
        if ($config === null) {
            return [];
        }
        $limit = is_array($config) ? ($config['limit'] ?? 3) : null;
        if (!is_int($limit) || $limit < 1 || $limit > 50) {
            throw new BlogException('page.latest_articles: expected an object with integer limit from 1 to 50');
        }
        $policy = $this->repository->policy();
        $items  = $policy->enabled
            ? array_map($this->build !== null ? $this->build->summary(...) : $this->repository->summary(...), array_slice($this->repository->publicRecords($locale, $policy), 0, $limit))
            : [];

        return ['latestArticles' => ['enabled' => $policy->enabled, 'items' => $items]];
    }
}
