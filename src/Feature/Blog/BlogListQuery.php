<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use App\Feature\Site\SiteLocale;

use function explode;
use function http_build_query;
use function is_string;
use function preg_match;
use function rawurlencode;
use function strcmp;
use function strlen;

use const PHP_INT_MAX;
use const PHP_QUERY_RFC3986;

/** Validated selection; canonical URLs are shared by filters, pagination and SEO. */
final readonly class BlogListQuery
{
    public function __construct(
        public ?string $tag = null,
        public ?int $year = null,
        public int $page = 1,
    ) {
    }

    /** @param array<string,mixed> $query */
    public static function parse(string $path, array $query): self
    {
        $tag  = null;
        $year = $query['year'] ?? null;
        if ($path !== '') {
            $parts = explode('/', $path);
            if (isset($parts[2]) || !isset($parts[1]) || $parts[1] === '') {
                throw new BlogListException(404);
            }
            if ($parts[0] === 'tags') {
                $tag = $parts[1];
                if (!preg_match('~^[\pL\pN][\pL\pN_-]*$~uD', $tag)) {
                    throw new BlogListException(404);
                }
            } elseif ($parts[0] === 'archive') {
                if ($year !== null && $year !== $parts[1]) {
                    throw new BlogListException(400);
                }
                $year = $parts[1];
            } else {
                throw new BlogListException(404);
            }
        }
        if ($year !== null && (!is_string($year) || !preg_match('/^[1-9][0-9]{3}$/D', $year))) {
            throw new BlogListException(400);
        }
        $page = $query['page'] ?? '1';
        if (!is_string($page) || !preg_match('/^[1-9][0-9]*$/D', $page)) {
            throw new BlogListException(400);
        }
        // Check the decimal string before casting or multiplying; huge valid
        // integers are out of range (404), never a float or an overflow (500).
        $max = (string) PHP_INT_MAX;
        if (strlen($page) > strlen($max) || (strlen($page) === strlen($max) && strcmp($page, $max) > 0)) {
            throw new BlogListException(404);
        }

        return new self($tag, $year === null ? null : (int) $year, (int) $page);
    }

    public function href(SiteLocale $locale): string
    {
        $path  = '/blog';
        $query = [];
        if ($this->tag !== null) {
            $path .= '/tags/' . rawurlencode($this->tag);
            if ($this->year !== null) {
                $query['year'] = $this->year;
            }
        } elseif ($this->year !== null) {
            $path .= '/archive/' . $this->year;
        }
        if ($this->page > 1) {
            $query['page'] = $this->page;
        }

        return $locale->url($path) . ($query === [] ? '' : '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986));
    }
}
