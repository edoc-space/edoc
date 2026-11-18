<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use App\Feature\Site\SiteLocale;
use App\Feature\Site\SiteLocaleResolver;
use DateTimeZone;
use PhpSoftBox\Markdown\YamlFrontMatterParser;
use Throwable;

use function array_column;
use function array_filter;
use function array_flip;
use function array_intersect_key;
use function array_is_list;
use function array_unique;
use function array_values;
use function clearstatcache;
use function dirname;
use function explode;
use function file_get_contents;
use function filter_var;
use function hash;
use function in_array;
use function is_array;
use function is_bool;
use function is_file;
use function is_int;
use function is_string;
use function json_decode;
use function parse_url;
use function preg_match;
use function preg_replace;
use function realpath;
use function serialize;
use function str_ends_with;
use function str_starts_with;
use function strcmp;
use function strlen;
use function substr;
use function trim;
use function usort;

use const FILTER_VALIDATE_URL;
use const JSON_THROW_ON_ERROR;
use const PHP_URL_PASS;
use const PHP_URL_USER;

/** Metadata cache contains no visibility decisions. Every view uses a fresh policy. */
final class BlogRepository
{
    /** @var array<string,array{digest:string,records:array}> */
    private array $cache = [];

    public function __construct(
        public readonly string $siteRoot,
        private readonly SiteLocaleResolver $locales,
        private readonly Clock $clock = new SystemClock(),
        private readonly YamlFrontMatterParser $parser = new YamlFrontMatterParser(),
    ) {
    }

    /** @return array<string,mixed> */
    public function config(): array
    {
        clearstatcache(true);
        $path = $this->siteRoot . '/site.json';
        try {
            $config = is_file($path) ? json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR) : [];
        } catch (Throwable) {
            throw new BlogException('blog.config: invalid site.json');
        }
        $config = is_array($config) ? $config : [];
        $blog   = $config['blog'] ?? [];
        if (!is_array($blog) || (isset($blog['enabled']) && !is_bool($blog['enabled']))) {
            throw new BlogException('blog.config: enabled must be boolean');
        }
        $size = $blog['page_size'] ?? 10;
        $zone = $config['timezone'] ?? 'UTC';
        if (!is_int($size) || $size < 1 || !is_string($zone) || !in_array($zone, DateTimeZone::listIdentifiers(), true)) {
            throw new BlogException('blog.config: invalid page_size or IANA timezone');
        }

        return ['enabled' => $blog['enabled'] ?? false, 'page_size' => $size, 'timezone' => $zone];
    }

    public function siteId(): string
    {
        return hash('sha256', (string) realpath($this->siteRoot));
    }

    public function policy(): PublicationPolicy
    {
        return new PublicationPolicy($this->config()['enabled'], $this->clock->now());
    }

    /** @return list<SiteLocale> */
    public function locales(): array
    {
        return $this->locales->all();
    }

    public function clear(): void
    {
        $this->cache = [];
    }

    /** @return array<string,array<string,mixed>> */
    public function records(SiteLocale $locale): array
    {
        $config = $this->config();
        if (!$config['enabled']) {
            return [];
        }
        $files   = BlogFiles::tree($this->siteRoot, $locale->contentPath('blog'), documentsOnly: true);
        $sources = [];
        foreach ($files as $file) {
            if (preg_match('~(?:^|/)[_.][^/]*~', $locale->stripContentPath('blog', $file)) || !preg_match('/\.mdx?$/D', $file)) {
                continue;
            }
            $sources[$file] = file_get_contents(BlogFiles::file($this->siteRoot, $file));
        }
        // Full bytes invalidate same-size edits and timestamp-preserving writes.
        $digest = hash('sha256', serialize([$this->siteId(), $locale, $config, $sources, $this->pageSlugs($locale)]));
        if (($this->cache[$locale->code]['digest'] ?? null) === $digest) {
            return $this->cache[$locale->code]['records'];
        }
        $records = [];
        foreach ($sources as $source => $text) {
            try {
                $parsed = $this->parser->parse($text);
                if ($parsed->diagnostics() !== []) {
                    throw new BlogException('invalid YAML front matter');
                }
                $meta  = $parsed->frontMatter();
                $draft = $meta['draft'] ?? false;
                if (!is_bool($draft)) {
                    throw new BlogException('draft must be boolean');
                }
                foreach (['title', 'description'] as $field) {
                    if ((!is_string($meta[$field] ?? null) || trim($meta[$field]) === '') && !$draft) {
                        throw new BlogException($field . ' is required');
                    }
                }
                $date = isset($meta['date']) ? PublicationDate::parse((string) $meta['date'], $config['timezone']) : null;
                if ($date === null && !$draft) {
                    throw new BlogException('date is required');
                }
                $path = $locale->stripContentPath('blog', $source);
                $slug = $meta['slug'] ?? preg_replace('~(?:/index)?\.mdx?$~D', '', $path);
                if (!is_string($slug) || !self::validSlug($slug)) {
                    throw new BlogException('invalid or reserved slug');
                }
                if (isset($records[$slug])) {
                    throw new BlogException('duplicate slug ' . $slug . '; conflicts with ' . $records[$slug]['source']);
                }
                $tags = $meta['tags'] ?? [];
                if (!is_array($tags) || !array_is_list($tags)) {
                    throw new BlogException('tags must be a list');
                }
                foreach ($tags as $tag) {
                    if (!is_string($tag) || !preg_match('~^[\pL\pN][\pL\pN_-]*$~uD', $tag)) {
                        throw new BlogException('invalid tag');
                    }
                }
                if (isset($meta['translation_key']) && !is_string($meta['translation_key'])) {
                    throw new BlogException('translation_key must be a string');
                }
                $image = $meta['image'] ?? null;
                if ($image !== null) {
                    if (!is_string($image)) {
                        throw new BlogException('image must be a public URL');
                    }
                    if (str_starts_with($image, '/storage/edoc/static/')) {
                        BlogFiles::file($this->siteRoot, 'static/' . substr($image, strlen('/storage/edoc/static/')));
                    } elseif (!filter_var($image, FILTER_VALIDATE_URL) || !preg_match('~^https?://~i', $image)
                        || parse_url($image, PHP_URL_USER) !== null || parse_url($image, PHP_URL_PASS) !== null) {
                        throw new BlogException('image must be a safe public HTTP URL or static path');
                    }
                }
                // Preview is a private raster in this article's sidecar, relative to its source directory.
                // Availability belongs to the build guard, never to the metadata list.
                $preview = $meta['preview'] ?? null;
                if ($preview !== null) {
                    $own = preg_match('~/index\.mdx?$~D', $source) ? dirname($source) : preg_replace('/\.mdx?$/D', '', $source);
                    if (!is_string($preview) || !BlogFiles::relative($preview)
                        || !str_starts_with(dirname($source) . '/' . $preview, $own . '/')
                        || !preg_match('/\.(?:png|jpe?g|webp|gif|avif)$/iD', $preview)) {
                        throw new BlogException('preview must be a raster path in the article sidecar');
                    }
                    $preview = dirname($source) . '/' . $preview;
                }
                $body           = self::body($text);
                $records[$slug] = [
                    'slug'        => $slug, 'title' => is_string($meta['title'] ?? null) ? trim($meta['title']) : '',
                    'description' => is_string($meta['description'] ?? null) ? trim($meta['description']) : '',
                    'date'        => $date, 'draft' => $draft, 'tags' => array_values(array_unique($tags)),
                    'preview'     => $preview,
                    'image'       => $image, 'translation_key' => $meta['translation_key'] ?? null,
                    'source'      => $source, 'path' => $path, 'locale' => $locale->code,
                    'href'        => $locale->url('/blog/' . $slug), 'format' => str_ends_with($source, '.mdx') ? 'mdx' : 'markdown',
                    'body'        => $body, 'bodyDigest' => hash('sha256', $body),
                    'key'         => substr(hash('sha256', $this->siteId() . ':' . $locale->code . ':' . $source . ':' . $slug), 0, 32),
                ];
            } catch (Throwable $exception) {
                throw new BlogException('blog.metadata: ' . $source . ': ' . $exception->getMessage());
            }
        }

        return ($this->cache[$locale->code] = ['digest' => $digest, 'records' => $records])['records'];
    }

    /**
     * Routing identity only, including authored links to unavailable articles.
     * Visibility still belongs to PublicationPolicy at the destination.
     *
     * @return array<string,string> source path => canonical URL
     */
    public function articleLinks(SiteLocale $locale): array
    {
        return array_column($this->records($locale), 'href', 'source');
    }

    /** @return list<array<string,mixed>> */
    public function publicRecords(SiteLocale $locale, PublicationPolicy $policy): array
    {
        $records = array_values(array_filter($this->records($locale), $policy->visible(...)));
        usort($records, static fn (array $a, array $b): int => ($b['date'] <=> $a['date']) ?: strcmp($a['slug'], $b['slug']));

        return $records;
    }

    public function listing(SiteLocale $locale, PublicationPolicy $policy): BlogListing
    {
        $config = $this->config();

        return new BlogListing($this->publicRecords($locale, $policy), $config['page_size'], $config['timezone']);
    }

    /** @param array<string,mixed> $article @return array<string,mixed> */
    public function summary(array $article): array
    {
        return array_intersect_key([...$article, 'date' => $article['date']?->format('c'), 'timezone' => $this->config()['timezone']], array_flip([
            'slug', 'title', 'description', 'date', 'tags', 'image', 'href', 'format', 'timezone',
        ]));
    }

    /** @param array<string,mixed> $article @return list<array{locale:string,href:string}> */
    public function alternates(array $article, PublicationPolicy $policy): array
    {
        $result = [];
        foreach ($this->locales() as $locale) {
            foreach ($this->publicRecords($locale, $policy) as $other) {
                $matches = is_string($article['translation_key']) && $article['translation_key'] !== ''
                    ? $article['translation_key'] === $other['translation_key'] : $article['slug'] === $other['slug'];
                if ($matches) {
                    $result[] = ['locale' => $locale->code, 'href' => $other['href']];
                    break;
                }
            }
        }

        return $result;
    }

    public static function body(string $text): string
    {
        return preg_replace('/^---\r?\n[\s\S]*?\r?\n---\r?\n?/', '', $text) ?? $text;
    }

    public static function validSlug(string $slug): bool
    {
        return BlogFiles::relative($slug) && !preg_match('~(?:^|/)_~', $slug) && preg_match('~^[\pL\pN][\pL\pN_/-]*$~uD', $slug) === 1
            && !in_array(explode('/', $slug)[0], ['tags', 'archive', 'rss.xml', '_modules', 'index'], true);
    }

    /** @return list<string> */
    private function pageSlugs(SiteLocale $locale): array
    {
        $slugs = [];
        foreach (BlogFiles::tree($this->siteRoot, $locale->contentPath('pages')) as $source) {
            if (!preg_match('/\.mdx?$/D', $source)) {
                continue;
            }
            $meta = $this->parser->parse(file_get_contents(BlogFiles::file($this->siteRoot, $source)))->frontMatter();
            $path = $locale->stripContentPath('pages', $source);
            $slug = $meta['slug'] ?? preg_replace('~(?:/index)?\.mdx?$~D', '', $path);
            if ($slug === 'blog' || str_starts_with((string) $slug, 'blog/')) {
                throw new BlogException('blog.conflict: page ' . $source . ' occupies /blog');
            }
            $slugs[] = (string) $slug;
        }

        return $slugs;
    }
}
