<?php

declare(strict_types=1);

namespace App\Feature\Documentation;

use App\Feature\Content\ContentRendererInterface;
use App\Feature\Content\ContentRenderOptions;
use App\Feature\Content\MdxTableOfContents;
use App\Feature\Site\SiteLocaleResolver;
use App\Feature\Site\SiteStorage;
use PhpSoftBox\Markdown\DefaultMarkdownSlugger;
use PhpSoftBox\Markdown\MarkdownHtmlPolicy;
use PhpSoftBox\Profiler\ProfilerInterface;
use PhpSoftBox\Storage\Storage;
use Psr\SimpleCache\CacheInterface;
use Throwable;

use function env;
use function hash;
use function implode;
use function in_array;
use function is_array;
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
            : $this->renderGeneratedIndex($current, $index);
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
                    fn (): mixed => $this->cache?->get($cacheKey),
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
                    fn (): array => new MdxTableOfContents($this->slugger)->extract($source),
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
                fn (): bool => $this->cache?->set($cacheKey, $document, $this->cacheTtl()) ?? false,
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
     * @param array<string,mixed> $index
     * @return array<string,mixed>
     */
    private function renderGeneratedIndex(array $current, array $index): array
    {
        $intro = is_array($current['intro'] ?? null)
            ? $this->renderDocument($current['intro'], $index)
            : null;

        return [
            'kind'        => 'generated-index',
            'format'      => is_array($intro) ? (string) ($intro['format'] ?? '') : null,
            'html'        => is_array($intro) ? (string) ($intro['html'] ?? '') : '',
            'module'      => is_array($intro) ? (string) ($intro['module'] ?? '') : '',
            'has_intro'   => is_array($intro),
            'items'       => $this->generatedIndexItems($current),
            'toc'         => is_array($intro) && is_array($intro['toc'] ?? null) ? $intro['toc'] : [],
            'diagnostics' => is_array($intro) && is_array($intro['diagnostics'] ?? null) ? $intro['diagnostics'] : [],
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
