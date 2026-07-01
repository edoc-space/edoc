<?php

declare(strict_types=1);

namespace App\Feature\Documentation;

use App\Feature\Content\ContentRendererInterface;
use App\Feature\Content\ContentRenderOptions;
use App\Feature\Site\SiteLocaleResolver;
use App\Feature\Site\SiteStorage;
use PhpSoftBox\Markdown\DefaultMarkdownSlugger;
use PhpSoftBox\Markdown\MarkdownHtmlPolicy;
use PhpSoftBox\Profiler\ProfilerInterface;
use PhpSoftBox\Storage\Storage;
use Psr\SimpleCache\CacheInterface;
use Throwable;

use function array_key_exists;
use function env;
use function hash;
use function implode;
use function in_array;
use function is_array;
use function preg_match;
use function preg_replace;
use function preg_split;
use function str_starts_with;
use function strlen;
use function strtolower;
use function trim;

final readonly class DocumentationRenderer
{
    private const string CACHE_VERSION = '1';

    private SiteLocaleResolver $locales;

    public function __construct(
        private Storage $storage,
        private ContentRendererInterface $renderer,
        ?SiteLocaleResolver $locales = null,
        private DefaultMarkdownSlugger $slugger = new DefaultMarkdownSlugger(),
        private ?CacheInterface $cache = null,
        private ?ProfilerInterface $profiler = null,
    ) {
        $this->locales = $locales ?? new SiteLocaleResolver($this->storage);
    }

    /**
     * @param array<string,mixed> $current
     * @param array<string,mixed> $index
     * @return array<string,mixed>
     */
    public function render(array $current, array $index): array
    {
        return $current['kind'] === 'document'
            ? $this->renderDocument($current, $index)
            : $this->renderGeneratedIndex($current);
    }

    /**
     * @param array<string,mixed> $current
     * @param array<string,mixed> $index
     * @return array<string,mixed>
     */
    private function renderDocument(array $current, array $index): array
    {
        $path        = (string) $current['document_path'];
        $storagePath = (string) ($current['storage_path'] ?? $path);
        $spanTags    = [
            'path'    => $path,
            'format'  => (string) ($current['format'] ?? 'markdown'),
            'locale'  => (string) ($current['locale'] ?? ''),
            'version' => (string) ($current['version'] ?? ''),
        ];
        $source = $this->profile(
            'documentation.document.read_source',
            fn (): string => $this->storage->disk($this->contentDisk())->read($storagePath),
            $spanTags,
        );
        $cacheKey = $this->documentCacheKey($current, $index, $source);

        if ($cacheKey !== null) {
            try {
                $cached = $this->profile(
                    'documentation.document.cache_get',
                    fn (): mixed               => $this->cache?->get($cacheKey),
                    [...$spanTags, 'cache_key' => $cacheKey],
                );
                if (is_array($cached)) {
                    return $cached;
                }
            } catch (Throwable) {
            }
        }

        if (($current['format'] ?? 'markdown') === 'mdx') {
            return $this->cacheDocument($cacheKey, [
                'kind'   => 'document',
                'format' => 'mdx',
                'module' => (string) ($current['module_path'] ?? '/local/storage/edoc/ru/docs/' . $path),
                'html'   => '',
                'toc'    => $this->profile(
                    'documentation.document.mdx_toc',
                    fn (): array => $this->mdxToc($source),
                    $spanTags,
                ),
                'diagnostics' => [],
            ], $spanTags);
        }

        $resolver = new DocsMarkdownLinkResolver(
            documentsByPath: $index['documents_by_path'],
            pagesBySlug: $index['pages'],
            storage: $this->storage,
            staticDisk: $this->staticDisk(),
            staticPrefix: (string) ($current['static_prefix'] ?? ''),
            docsUrlPrefix: (string) ($current['docs_url_prefix'] ?? '/docs'),
        );

        $document = $this->profile(
            'documentation.document.markdown_render',
            fn () => $this->renderer->render($source, new ContentRenderOptions(
                path: $path,
                linkResolver: $resolver,
                htmlPolicy: MarkdownHtmlPolicy::Escape,
                tocMinHeadingLevel: 2,
                tocMaxHeadingLevel: 3,
                externalLinkTarget: '_blank',
                externalLinksNoFollow: true,
            )),
            $spanTags,
        );

        return $this->cacheDocument($cacheKey, [
            'kind'        => 'document',
            'format'      => 'markdown',
            'html'        => $document->html,
            'toc'         => $document->toc,
            'diagnostics' => $document->diagnostics,
        ], $spanTags);
    }

    /**
     * @param array<string,mixed> $current
     * @param array<string,mixed> $index
     */
    private function documentCacheKey(array $current, array $index, string $source): ?string
    {
        if ($this->cache === null || !$this->cacheEnabled()) {
            return null;
        }

        return 'documentation_document_' . hash('sha256', implode('|', [
            self::CACHE_VERSION,
            (string) ($current['format'] ?? 'markdown'),
            (string) ($current['storage_path'] ?? ''),
            (string) ($current['module_path'] ?? ''),
            (string) ($current['docs_url_prefix'] ?? ''),
            (string) ($current['static_prefix'] ?? ''),
            (string) ($current['locale'] ?? ''),
            (string) ($current['version'] ?? ''),
            (string) ($index['content_fingerprint'] ?? ''),
            hash('sha256', $source),
        ]));
    }

    /**
     * @param array<string,mixed> $document
     * @return array<string,mixed>
     */
    private function cacheDocument(?string $cacheKey, array $document, array $tags = []): array
    {
        if ($cacheKey === null) {
            return $document;
        }

        try {
            $this->profile(
                'documentation.document.cache_set',
                fn (): bool            => $this->cache?->set($cacheKey, $document, $this->cacheTtl()) ?? false,
                [...$tags, 'cache_key' => $cacheKey],
            );
        } catch (Throwable) {
        }

        return $document;
    }

    private function cacheTtl(): ?int
    {
        $ttl = (int) env('APP_DOCUMENTATION_CACHE_TTL', '86400');

        return $ttl > 0 ? $ttl : null;
    }

    private function cacheEnabled(): bool
    {
        $value = strtolower(trim((string) env('APP_DOCUMENTATION_CACHE', '1')));

        return !in_array($value, ['0', 'false', 'off', 'no'], true);
    }

    /**
     * @param array<string,mixed> $current
     * @return array<string,mixed>
     */
    private function renderGeneratedIndex(array $current): array
    {
        return [
            'kind'        => 'generated-index',
            'html'        => '',
            'items'       => $this->generatedIndexItems($current),
            'toc'         => [],
            'diagnostics' => [],
        ];
    }

    /**
     * @param array<string,mixed> $current
     * @return list<array<string,string>>
     */
    private function generatedIndexItems(array $current): array
    {
        $items    = [];
        $children = $current['children'] ?? [];
        if (!is_array($children)) {
            return [];
        }

        foreach ($children as $child) {
            if (!is_array($child) || ($child['href'] ?? null) === null) {
                continue;
            }

            $items[] = [
                'id'          => (string) ($child['id'] ?? $child['href']),
                'kind'        => (string) ($child['kind'] ?? ''),
                'type'        => (string) ($child['type'] ?? ''),
                'title'       => (string) ($child['title'] ?? $child['label'] ?? ''),
                'label'       => (string) ($child['label'] ?? $child['title'] ?? ''),
                'href'        => (string) $child['href'],
                'description' => (string) ($child['description'] ?? ''),
            ];
        }

        return $items;
    }

    /**
     * @return list<array{level:int,title:string,id:string}>
     */
    private function mdxToc(string $source): array
    {
        $toc         = [];
        $ids         = [];
        $insideFence = false;
        $fence       = '';
        $lines       = preg_split('~\R~u', $this->stripFrontMatter($source)) ?: [];

        foreach ($lines as $line) {
            if (preg_match('#^\s{0,3}(`{3,}|~{3,})#', $line, $matches) === 1) {
                if (!$insideFence) {
                    $insideFence = true;
                    $fence       = $matches[1];
                } elseif (str_starts_with(trim($line), $fence)) {
                    $insideFence = false;
                    $fence       = '';
                }

                continue;
            }

            if ($insideFence) {
                continue;
            }

            if (preg_match('~^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$~u', $line, $matches) !== 1) {
                continue;
            }

            $title = $this->plainHeadingTitle($matches[2]);
            if ($title === '') {
                continue;
            }

            $baseId = $this->slugger->slug($title);
            $id     = $baseId;
            if (array_key_exists($baseId, $ids)) {
                $ids[$baseId]++;
                $id = $baseId . '-' . $ids[$baseId];
            } else {
                $ids[$baseId] = 1;
            }

            $level = strlen($matches[1]);
            if ($level < 2 || $level > 3) {
                continue;
            }

            $toc[] = [
                'level' => $level,
                'title' => $title,
                'id'    => $id,
            ];
        }

        return $toc;
    }

    private function stripFrontMatter(string $source): string
    {
        if (preg_match('~\A---[ \t]*\R.*?\R---[ \t]*(?:\R|$)~su', $source, $matches) !== 1) {
            return $source;
        }

        return (string) preg_replace('~\A---[ \t]*\R.*?\R---[ \t]*(?:\R|$)~su', '', $source, 1);
    }

    private function plainHeadingTitle(string $title): string
    {
        $title = (string) preg_replace('~!\[([^\]]*)]\([^)]+\)~u', '$1', $title);
        $title = (string) preg_replace('~\[([^\]]+)]\([^)]+\)~u', '$1', $title);
        $title = (string) preg_replace('~`([^`]*)`~u', '$1', $title);
        $title = (string) preg_replace('~<[^>]+>~u', '', $title);
        $title = (string) preg_replace('#[*_~]+#u', '', $title);
        $title = (string) preg_replace('~\s+~u', ' ', $title);

        return trim($title);
    }

    private function contentDisk(): string
    {
        return $this->locales->hasSiteDisk() ? SiteStorage::SITE_DISK : DocumentationStorage::DOCS_DISK;
    }

    private function staticDisk(): string
    {
        return $this->locales->hasSiteDisk() ? SiteStorage::SITE_DISK : DocumentationStorage::STATIC_DISK;
    }

    /**
     * @template T
     * @param callable():T $callback
     * @param array<string,mixed> $tags
     * @return T
     */
    private function profile(string $name, callable $callback, array $tags = []): mixed
    {
        if ($this->profiler === null || !$this->profiler->enabled()) {
            return $callback();
        }

        return $this->profiler->span($name, $callback, tags: $tags, category: 'documentation');
    }
}
