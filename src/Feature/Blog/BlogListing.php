<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use App\Feature\Site\SiteLocale;
use DateTimeZone;

use function array_slice;
use function count;
use function in_array;
use function intdiv;
use function krsort;
use function ksort;
use function max;
use function min;

/** One locale's current public snapshot. No cached visibility or hidden facets. */
final readonly class BlogListing
{
    /** @param list<array<string,mixed>> $records */
    public function __construct(
        private array $records,
        private int $pageSize,
        private string $timezone,
    ) {
    }

    /** @return array<string,mixed> */
    public function select(BlogListQuery $query, SiteLocale $locale): array
    {
        $tags    = [];
        $years   = [];
        $matches = [];
        $zone    = new DateTimeZone($this->timezone);

        foreach ($this->records as $article) {
            $year    = (int) $article['date']->setTimezone($zone)->format('Y');
            $hasTag  = $query->tag === null || in_array($query->tag, $article['tags'], true);
            $hasYear = $query->year === null || $query->year === $year;
            $years[$year] ??= 0;
            if ($hasTag) {
                ++$years[$year];
            }
            foreach ($article['tags'] as $tag) {
                $tags[$tag] ??= 0;
                if ($hasYear) {
                    ++$tags[$tag];
                }
            }
            if ($hasTag && $hasYear) {
                $matches[] = $article;
            }
        }
        if (($query->tag !== null && !isset($tags[$query->tag])) || ($query->year !== null && !isset($years[$query->year]))) {
            throw new BlogListException(404);
        }
        $total = count($matches);
        $pages = max(1, intdiv(max(0, $total - 1), $this->pageSize) + 1);
        if ($query->page > $pages) {
            throw new BlogListException(404);
        }
        ksort($tags);
        krsort($years);
        $tagOptions = [];
        foreach ($tags as $tag => $count) {
            $tagOptions[] = ['value' => (string) $tag, 'count' => $count, 'href' => new BlogListQuery((string) $tag, $query->year)->href($locale)];
        }
        $yearOptions = [];
        foreach ($years as $year => $count) {
            $yearOptions[] = ['value' => $year, 'count' => $count, 'href' => new BlogListQuery($query->tag, $year)->href($locale)];
        }
        // A bounded window remains usable even with a very large archive.
        $pageLinks = [];
        for ($page = max(1, $query->page - 2); $page <= min($pages, $query->page + 2); ++$page) {
            $pageLinks[] = ['page' => $page, 'href' => new BlogListQuery($query->tag, $query->year, $page)->href($locale)];
        }

        return [
            'href'       => $locale->url('/blog'), 'canonical' => $query->href($locale),
            'articles'   => array_slice($matches, ($query->page - 1) * $this->pageSize, $this->pageSize),
            'total'      => $total, 'filters' => ['tag' => $query->tag, 'year' => $query->year],
            'tags'       => $tagOptions, 'years' => $yearOptions,
            'clearTag'   => new BlogListQuery(year: $query->year)->href($locale),
            'clearYear'  => new BlogListQuery(tag: $query->tag)->href($locale),
            'pagination' => [
                'page'     => $query->page, 'pages' => $pages, 'pageSize' => $this->pageSize, 'links' => $pageLinks,
                'previous' => $query->page > 1 ? new BlogListQuery($query->tag, $query->year, $query->page - 1)->href($locale) : null,
                'next'     => $query->page < $pages ? new BlogListQuery($query->tag, $query->year, $query->page + 1)->href($locale) : null,
                'first'    => new BlogListQuery($query->tag, $query->year)->href($locale),
                'last'     => new BlogListQuery($query->tag, $query->year, $pages)->href($locale),
            ],
        ];
    }
}
