<?php

declare(strict_types=1);

namespace App\Feature\Documentation;

use App\Feature\Site\SiteLocale;
use App\Feature\Site\SiteLocaleResolver;
use App\Feature\Site\SiteStorage;
use App\Path;
use FilesystemIterator;
use JsonException;
use PhpSoftBox\Markdown\MarkdownDiagnostic;
use PhpSoftBox\Markdown\YamlFrontMatterParser;
use PhpSoftBox\Mdx\MdxDiagnostic;
use PhpSoftBox\Mdx\YamlMdxFrontMatterParser;
use PhpSoftBox\Profiler\ProfilerInterface;
use PhpSoftBox\Storage\Contracts\StorageInterface;
use PhpSoftBox\Storage\Storage;
use Psr\SimpleCache\CacheInterface;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;
use Throwable;

use function array_filter;
use function array_is_list;
use function array_key_exists;
use function array_keys;
use function array_map;
use function array_pop;
use function array_values;
use function basename;
use function count;
use function dirname;
use function env;
use function explode;
use function filemtime;
use function filesize;
use function hash;
use function implode;
use function in_array;
use function is_array;
use function is_bool;
use function is_dir;
use function is_file;
use function is_numeric;
use function is_string;
use function json_decode;
use function max;
use function mb_strtoupper;
use function parse_url;
use function pathinfo;
use function preg_match;
use function preg_quote;
use function preg_replace;
use function preg_split;
use function rawurlencode;
use function sort;
use function str_contains;
use function str_ends_with;
use function str_replace;
use function str_starts_with;
use function strip_tags;
use function strlen;
use function strtolower;
use function substr;
use function trim;
use function usort;

use const JSON_THROW_ON_ERROR;
use const PATHINFO_FILENAME;
use const PHP_URL_FRAGMENT;
use const PHP_URL_PATH;
use const SORT_STRING;

final class DocumentationIndexBuilder
{
    private const string CACHE_VERSION       = '1';
    private const string VERSION_CONFIG_PATH = 'versions.json';
    private const string VERSIONED_DOCS_DIR  = 'versioned_docs';
    private const string OVERRIDES_DIR       = 'overrides';

    private SiteLocaleResolver $locales;

    /**
     * @var array<string,array<string,mixed>>
     */
    private array $requestCache = [];

    /**
     * @var array<string,string>
     */
    private array $fingerprintCache = [];

    public function __construct(
        private Storage $storage,
        ?SiteLocaleResolver $locales = null,
        private YamlFrontMatterParser $frontMatterParser = new YamlFrontMatterParser(),
        private YamlMdxFrontMatterParser $mdxFrontMatterParser = new YamlMdxFrontMatterParser(),
        private ?CacheInterface $cache = null,
        private ?Path $path = null,
        private ?ProfilerInterface $profiler = null,
    ) {
        $this->locales = $locales ?? new SiteLocaleResolver($this->storage);
    }

    /**
     * @return array{
     *     sidebars:list<array<string,string>>,
     *     tree:list<array<string,mixed>>,
     *     pages:array<string,array<string,mixed>>,
     *     categories:array<string,array<string,mixed>>,
     *     documents_by_path:array<string,array<string,mixed>>,
     *     redirects:array<string,array<string,mixed>>,
     *     search_entries:list<array<string,mixed>>,
     *     flat_pages:list<array<string,mixed>>,
     *     first_sidebar_slug:string|null,
     *     first_slug:string|null,
     *     diagnostics:list<array<string,mixed>>
     * }
     */
    public function build(?string $localeCode = null, ?string $versionCode = null): array
    {
        $locale          = $this->locales->byCode($localeCode);
        $requestCacheKey = ($locale?->code ?? 'missing') . '|' . ($versionCode ?? 'current');
        if (isset($this->requestCache[$requestCacheKey])) {
            return $this->requestCache[$requestCacheKey];
        }

        $spanTags = [
            'locale'  => $locale?->code ?? ($localeCode ?? 'default'),
            'version' => $versionCode ?? 'current',
        ];

        $fingerprint = $this->profile('documentation.index.fingerprint', fn (): string => $this->contentFingerprint($locale), $spanTags);
        $cacheKey    = $this->cacheKey($localeCode, $versionCode, $fingerprint);
        if ($cacheKey !== null) {
            try {
                $cached = $this->profile(
                    'documentation.index.cache_get',
                    fn (): mixed               => $this->cache?->get($cacheKey),
                    [...$spanTags, 'cache_key' => $cacheKey],
                );
                if (is_array($cached)) {
                    return $this->requestCache[$requestCacheKey] = $cached;
                }
            } catch (Throwable) {
            }
        }

        $index = $this->profile(
            'documentation.index.build_fresh',
            fn (): array => $this->buildFresh($localeCode, $versionCode, $fingerprint),
            $spanTags,
        );
        if ($cacheKey !== null) {
            try {
                $this->profile(
                    'documentation.index.cache_set',
                    fn (): bool                => $this->cache?->set($cacheKey, $index, $this->cacheTtl()) ?? false,
                    [...$spanTags, 'cache_key' => $cacheKey],
                );
            } catch (Throwable) {
            }
        }

        return $this->requestCache[$requestCacheKey] = $index;
    }

    /**
     * @return array{
     *     sidebars:list<array<string,string>>,
     *     tree:list<array<string,mixed>>,
     *     pages:array<string,array<string,mixed>>,
     *     categories:array<string,array<string,mixed>>,
     *     documents_by_path:array<string,array<string,mixed>>,
     *     redirects:array<string,array<string,mixed>>,
     *     search_entries:list<array<string,mixed>>,
     *     flat_pages:list<array<string,mixed>>,
     *     first_sidebar_slug:string|null,
     *     first_slug:string|null,
     *     diagnostics:list<array<string,mixed>>
     * }
     */
    private function buildFresh(?string $localeCode = null, ?string $versionCode = null, string $fingerprint = ''): array
    {
        $locale = $this->locales->byCode($localeCode);
        if ($locale === null) {
            return $this->emptyIndex();
        }

        $diagnostics = [];
        $versions    = $this->versions($locale, $diagnostics, $versionCode);
        $selected    = $this->selectedVersion($versions);

        if ($versionCode !== null && !$this->versionDocsEnabled($selected)) {
            $index             = $this->emptyIndex();
            $index['versions'] = $versions;

            return $index;
        }

        $fileSources = $this->contentFileSources($locale, $selected);
        $files       = array_keys($fileSources);
        sort($files, SORT_STRING);

        $metadata    = [];
        $documents   = [];
        $directories = [];

        foreach ($files as $file) {
            $path = $this->normalizeRelativePath($file);
            if ($path === null || $this->isIgnoredPath($path)) {
                continue;
            }

            if ($this->isCategoryFile($path)) {
                $metadata[$this->directory($path)]    = $this->readCategoryMetadata($path, $diagnostics, $locale, $fileSources[$path]['storage_path'] ?? null);
                $directories[$this->directory($path)] = true;
                continue;
            }

            if (!$this->isContentFile($path)) {
                continue;
            }

            $document = $this->readDocumentMetadata(
                $path,
                $diagnostics,
                $locale,
                $fileSources[$path]['storage_path'] ?? null,
                $fileSources[$path]['module_path'] ?? null,
                $selected,
            );
            if ($document === null) {
                continue;
            }

            $documents[$path] = $document;
            $dir              = $this->directory($path);
            if ($dir !== '') {
                foreach ($this->directoryAncestors($dir) as $ancestor) {
                    $directories[$ancestor] = true;
                }
            }
        }

        $categories = [];
        foreach (array_keys($directories) as $dir) {
            if ($dir === '') {
                continue;
            }

            $category = $this->categoryNode($dir, $metadata[$dir] ?? [], $locale, $selected);
            if ($category === null) {
                continue;
            }

            $categories[$dir] = $category;
        }

        foreach ($categories as $dir => $category) {
            $indexPath = $this->indexDocumentPath($dir, $documents);
            $link      = $metadata[$dir]['link'] ?? null;

            if (is_array($link) && ($link['type'] ?? null) === 'generated-index') {
                $categories[$dir]['href'] = $this->docsHref($dir, $locale, $selected);
                $categories[$dir]['slug'] = $dir;
                continue;
            }

            if (is_array($link) && ($link['type'] ?? null) === 'doc') {
                $target = $this->normalizeDocPath((string) ($link['path'] ?? $link['id'] ?? ''));
                if ($target !== null && isset($documents[$target])) {
                    $categories[$dir]['href'] = $documents[$target]['href'];
                    $categories[$dir]['slug'] = $documents[$target]['slug'];
                    continue;
                }
            }

            if ($link === null && $indexPath !== null && isset($documents[$indexPath])) {
                $categories[$dir]['href'] = $documents[$indexPath]['href'];
                $categories[$dir]['slug'] = $documents[$indexPath]['slug'];
            }
        }

        $tree = [];
        foreach ($categories as $dir => $category) {
            $parent = $this->directory($dir);
            if ($parent !== '' && isset($categories[$parent])) {
                $categories[$parent]['children'][] = $category;
                continue;
            }

            $tree[] = $category;
        }

        foreach ($documents as $path => $document) {
            if ($this->isIndexFile($path) && $this->directory($path) !== '') {
                continue;
            }

            $dir = $this->directory($path);
            if ($dir !== '' && isset($categories[$dir])) {
                $categories[$dir]['children'][] = $document;
                continue;
            }

            $tree[] = $document;
        }

        $tree       = $this->sortTree($this->syncCategoryChildren($tree, $categories));
        $categories = $this->indexCategoriesByPath($tree);

        $pages = [];
        foreach ($documents as $document) {
            $this->registerPage($pages, $document, $diagnostics);
        }

        foreach ($categories as $category) {
            if (($category['href'] ?? null) === null || ($category['slug'] ?? '') === '') {
                continue;
            }

            if (($category['link_type'] ?? null) !== 'generated-index') {
                continue;
            }

            $this->registerPage($pages, $category, $diagnostics);
        }

        $flatPages = $this->flatPages($tree, $pages);
        $sidebars  = $this->sidebars($tree);
        $redirects = $this->redirects($metadata, $documents, $pages, $diagnostics, $locale);
        $search    = $this->searchEntries($flatPages);

        return [
            'sidebars'            => $sidebars,
            'tree'                => $tree,
            'pages'               => $pages,
            'categories'          => $categories,
            'documents_by_path'   => $documents,
            'redirects'           => $redirects,
            'search_entries'      => $search,
            'flat_pages'          => $flatPages,
            'first_sidebar_slug'  => $sidebars[0]['slug'] ?? null,
            'first_slug'          => $flatPages[0]['slug'] ?? null,
            'versions'            => $versions,
            'content_fingerprint' => $fingerprint,
            'diagnostics'         => $diagnostics,
        ];
    }

    public function normalizeSlug(string $path): string
    {
        $path = str_replace('\\', '/', trim($path));
        $path = preg_replace('~^/docs/?~', '', $path) ?? $path;
        $path = trim($path, '/');
        $path = preg_replace('~/+~', '/', $path) ?? $path;

        if ($path === '.') {
            return '';
        }

        return $path;
    }

    /**
     * @param array<string,mixed> $current
     * @return list<array{locale:string,href:string}>
     */
    public function alternateLinks(array $current): array
    {
        $alternates  = [];
        $defaultHref = null;

        foreach ($this->locales->all() as $locale) {
            $index = $this->build($locale->code);
            $page  = $this->findTranslation($index['pages'], $current);
            if ($page === null) {
                continue;
            }

            $href = (string) ($page['href'] ?? '');
            if ($href === '') {
                continue;
            }

            $alternates[] = [
                'locale' => $locale->code,
                'href'   => $href,
            ];

            if ($locale->default) {
                $defaultHref = $href;
            }
        }

        if ($defaultHref !== null) {
            $alternates[] = [
                'locale' => 'x-default',
                'href'   => $defaultHref,
            ];
        }

        return $alternates;
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     * @return array<string,mixed>|null
     */
    private function readDocumentMetadata(
        string $path,
        array &$diagnostics,
        SiteLocale $locale,
        ?string $storagePath = null,
        ?string $modulePath = null,
        ?array $version = null,
    ): ?array {
        $storagePath ??= $this->contentPath($locale, $path);
        $modulePath ??= $this->modulePath($locale, $path);
        $source = $this->readContent($locale, $storagePath);
        $parsed = $this->parseSource($path, $source, $diagnostics);

        $frontMatter = $parsed['frontMatter'];
        $draft       = $this->boolValue($frontMatter['draft'] ?? false);
        if ($draft && (string) env('APP_ENV', 'dev') === 'prod') {
            return null;
        }

        if (!$this->versionAllows($frontMatter, $version)) {
            return null;
        }

        $defaultSlug = $this->isIndexFile($path)
            ? $this->directory($path)
            : $this->stripContentExtension($path);

        $slug  = $this->normalizeSlug($this->stringValue($frontMatter['slug'] ?? '') ?: $defaultSlug);
        $title = $this->stringValue($frontMatter['title'] ?? '')
            ?: $this->firstHeading($parsed['body'])
            ?: $this->humanize(pathinfo($path, PATHINFO_FILENAME));

        $label = $this->stringValue($frontMatter['sidebar_label'] ?? '') ?: $title;

        $searchContexts = $this->searchContexts($parsed['body']);

        return [
            'id'                     => 'doc:' . $path,
            'kind'                   => 'document',
            'type'                   => 'document',
            'title'                  => $title,
            'label'                  => $label,
            'slug'                   => $slug,
            'href'                   => $this->docsHref($slug, $locale, $version),
            'path'                   => $path,
            'source_path'            => $path,
            'document_path'          => $path,
            'storage_path'           => $storagePath,
            'module_path'            => $modulePath,
            'static_prefix'          => $this->locales->hasSiteDisk() ? 'static' : '',
            'docs_url_prefix'        => $this->docsUrlPrefix($locale, $version),
            'locale'                 => $locale->code,
            'version'                => $this->versionCode($version),
            'format'                 => $this->contentFormat($path),
            'parent_path'            => $this->directory($path),
            'position'               => $this->numberValue($frontMatter['sidebar_position'] ?? null),
            'draft'                  => $draft,
            'description'            => $this->stringValue($frontMatter['description'] ?? ''),
            'translation_key'        => $this->stringValue($frontMatter['translation_key'] ?? ''),
            'search_text'            => implode(' ', $searchContexts),
            'search_contexts'        => $searchContexts,
            'hide_table_of_contents' => $this->boolValue($frontMatter['hide_table_of_contents'] ?? false),
            'children'               => [],
        ];
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     * @return array<string,mixed>
     */
    private function readCategoryMetadata(string $path, array &$diagnostics, SiteLocale $locale, ?string $storagePath = null): array
    {
        try {
            $data = json_decode($this->readContent($locale, $storagePath ?? $this->contentPath($locale, $path)), true, 512, JSON_THROW_ON_ERROR);
            if (is_array($data)) {
                return $data;
            }
        } catch (JsonException $exception) {
            $diagnostics[] = [
                'level'   => 'error',
                'code'    => 'category.invalid_json',
                'message' => $exception->getMessage(),
                'path'    => $path,
                'line'    => null,
            ];
        }

        return [];
    }

    /**
     * @param array<string,mixed> $metadata
     * @return array<string,mixed>|null
     */
    private function categoryNode(string $dir, array $metadata, SiteLocale $locale, ?array $version = null): ?array
    {
        if (!$this->versionAllows($metadata, $version)) {
            return null;
        }

        $link      = $metadata['link'] ?? ['type' => 'generated-index'];
        $linkType  = is_array($link) ? (string) ($link['type'] ?? 'generated-index') : null;
        $collapsed = $this->categoryCollapsed($metadata);

        $description = $this->stringValue($metadata['description'] ?? '');

        return [
            'id'              => 'category:' . $dir,
            'kind'            => 'category',
            'type'            => 'category',
            'title'           => $this->stringValue($metadata['label'] ?? '') ?: $this->humanize(basename($dir)),
            'label'           => $this->stringValue($metadata['label'] ?? '') ?: $this->humanize(basename($dir)),
            'slug'            => null,
            'href'            => null,
            'path'            => $dir,
            'storage_path'    => $this->contentPath($locale, $dir),
            'parent_path'     => $this->directory($dir),
            'position'        => $this->numberValue($metadata['position'] ?? null),
            'description'     => $description,
            'translation_key' => $this->stringValue($metadata['translation_key'] ?? ''),
            'search_text'     => $description,
            'search_contexts' => $description === '' ? [] : [$description],
            'docs_url_prefix' => $this->docsUrlPrefix($locale, $version),
            'locale'          => $locale->code,
            'version'         => $this->versionCode($version),
            'sidebar'         => $this->boolValue($metadata['sidebar'] ?? false),
            'collapsed'       => $collapsed,
            'expanded'        => !$collapsed,
            'link_type'       => $linkType,
            'children'        => [],
        ];
    }

    /**
     * @param array<string,mixed> $metadata
     */
    private function categoryCollapsed(array $metadata): bool
    {
        if (array_key_exists('expanded', $metadata)) {
            return !$this->boolValue($metadata['expanded']);
        }

        return $this->boolValue($metadata['collapsed'] ?? false);
    }

    /**
     * @param array<string,array<string,mixed>> $pages
     * @param array<string,mixed> $page
     * @param list<array<string,mixed>> $diagnostics
     */
    private function registerPage(array &$pages, array $page, array &$diagnostics): void
    {
        $slug = (string) ($page['slug'] ?? '');
        if ($slug === '') {
            return;
        }

        if (isset($pages[$slug])) {
            $diagnostics[] = [
                'level'   => 'error',
                'code'    => 'slug.duplicate',
                'message' => 'Duplicate documentation slug: ' . $slug,
                'path'    => (string) ($page['path'] ?? ''),
                'line'    => null,
            ];

            return;
        }

        $pages[$slug] = $page;
    }

    /**
     * @param array<string,array<string,mixed>> $pages
     * @param array<string,mixed> $current
     * @return array<string,mixed>|null
     */
    private function findTranslation(array $pages, array $current): ?array
    {
        $translationKey = $this->stringValue($current['translation_key'] ?? '');
        if ($translationKey !== '') {
            foreach ($pages as $page) {
                if ($this->stringValue($page['translation_key'] ?? '') === $translationKey) {
                    return $page;
                }
            }
        }

        $slug = $this->normalizeSlug((string) ($current['slug'] ?? ''));

        return $pages[$slug] ?? null;
    }

    /**
     * @param list<array<string,mixed>> $tree
     * @param array<string,array<string,mixed>> $categories
     * @return list<array<string,mixed>>
     */
    private function syncCategoryChildren(array $tree, array $categories): array
    {
        foreach ($tree as $index => $node) {
            if (($node['kind'] ?? null) !== 'category') {
                continue;
            }

            $path = (string) ($node['path'] ?? '');
            if (isset($categories[$path])) {
                $tree[$index] = $categories[$path];
            }

            if (is_array($tree[$index]['children'] ?? null)) {
                $tree[$index]['children'] = $this->syncCategoryChildren($tree[$index]['children'], $categories);
            }
        }

        return $tree;
    }

    /**
     * @param list<array<string,mixed>> $nodes
     * @return array<string,array<string,mixed>>
     */
    private function indexCategoriesByPath(array $nodes): array
    {
        $categories = [];
        foreach ($nodes as $node) {
            if (($node['kind'] ?? null) === 'category') {
                $categories[(string) ($node['path'] ?? '')] = $node;
            }

            if (is_array($node['children'] ?? null)) {
                $categories = [...$categories, ...$this->indexCategoriesByPath($node['children'])];
            }
        }

        return $categories;
    }

    /**
     * @param list<array<string,mixed>> $tree
     * @return list<array<string,string>>
     */
    private function sidebars(array $tree): array
    {
        $candidates = [];
        foreach ($tree as $node) {
            if (($node['kind'] ?? null) !== 'category' || ($node['href'] ?? null) === null) {
                continue;
            }

            $candidates[] = $node;
        }

        $explicit = [];
        foreach ($candidates as $node) {
            if (($node['sidebar'] ?? false) === true) {
                $explicit[] = $node;
            }
        }

        $nodes = $explicit !== [] ? $explicit : $candidates;

        $sidebars = [];
        foreach ($nodes as $node) {
            $sidebars[] = $this->sidebarItem($node);
        }

        return $sidebars;
    }

    /**
     * @param array<string,mixed> $node
     * @return array{id:string,title:string,label:string,href:string,slug:string,path:string,description:string}
     */
    private function sidebarItem(array $node): array
    {
        return [
            'id'          => (string) ($node['path'] ?? $node['slug'] ?? ''),
            'title'       => (string) ($node['title'] ?? $node['label'] ?? ''),
            'label'       => (string) ($node['label'] ?? $node['title'] ?? ''),
            'href'        => (string) ($node['href'] ?? ''),
            'slug'        => (string) ($node['slug'] ?? ''),
            'path'        => (string) ($node['path'] ?? ''),
            'description' => (string) ($node['description'] ?? ''),
        ];
    }

    /**
     * @param list<array<string,mixed>> $nodes
     * @return list<array<string,mixed>>
     */
    private function sortTree(array $nodes): array
    {
        foreach ($nodes as $index => $node) {
            if (is_array($node['children'] ?? null)) {
                $node['children'] = $this->sortTree($node['children']);
            }
            $nodes[$index] = $node;
        }

        usort($nodes, static function (array $a, array $b): int {
            $aPosition = $a['position'] ?? null;
            $bPosition = $b['position'] ?? null;

            if ($aPosition !== null || $bPosition !== null) {
                return ($aPosition ?? 1_000_000) <=> ($bPosition ?? 1_000_000);
            }

            return ((string) ($a['label'] ?? $a['title'] ?? '')) <=> ((string) ($b['label'] ?? $b['title'] ?? ''));
        });

        return array_values($nodes);
    }

    /**
     * @param list<array<string,mixed>> $nodes
     * @param array<string,array<string,mixed>> $pages
     * @return list<array<string,mixed>>
     */
    private function flatPages(array $nodes, array $pages): array
    {
        $flat = [];
        foreach ($nodes as $node) {
            $slug = (string) ($node['slug'] ?? '');
            if ($slug !== '' && isset($pages[$slug])) {
                $flat[] = $pages[$slug];
            }

            if (is_array($node['children'] ?? null)) {
                foreach ($this->flatPages($node['children'], $pages) as $child) {
                    $flat[] = $child;
                }
            }
        }

        return $flat;
    }

    /**
     * @param list<array<string,mixed>> $pages
     * @return list<array<string,mixed>>
     */
    private function searchEntries(array $pages): array
    {
        $entries = [];
        foreach ($pages as $page) {
            $href = (string) ($page['href'] ?? '');
            if ($href === '') {
                continue;
            }

            $entries[] = [
                'id'          => (string) ($page['id'] ?? $href),
                'title'       => (string) ($page['title'] ?? $page['label'] ?? ''),
                'label'       => (string) ($page['label'] ?? $page['title'] ?? ''),
                'href'        => $href,
                'kind'        => (string) ($page['kind'] ?? ''),
                'type'        => (string) ($page['type'] ?? ''),
                'description' => (string) ($page['description'] ?? ''),
                'content'     => (string) ($page['search_text'] ?? ''),
                'contexts'    => $this->stringList($page['search_contexts'] ?? []),
            ];
        }

        return $entries;
    }

    /**
     * @param array<string,array<string,mixed>> $metadata
     * @param array<string,array<string,mixed>> $documents
     * @param array<string,array<string,mixed>> $pages
     * @param list<array<string,mixed>> $diagnostics
     * @return array<string,array<string,mixed>>
     */
    private function redirects(array $metadata, array $documents, array $pages, array &$diagnostics, SiteLocale $locale): array
    {
        $redirects = [];

        foreach ($metadata as $dir => $categoryMetadata) {
            foreach ($this->redirectItems($categoryMetadata['redirects'] ?? null) as $redirect) {
                $path = $this->categoryMetadataPath($dir);
                $from = $this->redirectSource($redirect['from'], $dir, $locale);
                $to   = $this->redirectDestination($redirect['to'], $dir, $documents, $pages, $locale);

                if ($from === null || $to === null) {
                    $diagnostics[] = [
                        'level'   => 'warning',
                        'code'    => 'redirect.invalid',
                        'message' => 'Invalid documentation redirect.',
                        'path'    => $path,
                        'line'    => null,
                    ];
                    continue;
                }

                if (isset($pages[$from])) {
                    $diagnostics[] = [
                        'level'   => 'warning',
                        'code'    => 'redirect.source_conflict',
                        'message' => 'Redirect source points to an existing documentation page: ' . $from,
                        'path'    => $path,
                        'line'    => null,
                    ];
                    continue;
                }

                if ($from === $to['slug']) {
                    $diagnostics[] = [
                        'level'   => 'warning',
                        'code'    => 'redirect.self',
                        'message' => 'Redirect source and target are the same: ' . $from,
                        'path'    => $path,
                        'line'    => null,
                    ];
                    continue;
                }

                if (isset($redirects[$from])) {
                    $diagnostics[] = [
                        'level'   => 'warning',
                        'code'    => 'redirect.duplicate',
                        'message' => 'Duplicate documentation redirect source: ' . $from,
                        'path'    => $path,
                        'line'    => null,
                    ];
                    continue;
                }

                $redirects[$from] = [
                    'from'   => $from,
                    'to'     => $to['href'],
                    'status' => 301,
                    'path'   => $path,
                ];
            }
        }

        return $redirects;
    }

    /**
     * @return list<array{from:string,to:string}>
     */
    private function redirectItems(mixed $redirects): array
    {
        if (!is_array($redirects)) {
            return [];
        }

        $items = [];
        if (array_is_list($redirects)) {
            foreach ($redirects as $redirect) {
                if (!is_array($redirect)) {
                    continue;
                }

                $from = $this->stringValue($redirect['from'] ?? '');
                $to   = $this->stringValue($redirect['to'] ?? '');
                if ($from === '' || $to === '') {
                    continue;
                }

                $items[] = ['from' => $from, 'to' => $to];
            }

            return $items;
        }

        foreach ($redirects as $from => $to) {
            if (!is_string($from)) {
                continue;
            }

            $to = $this->stringValue($to);
            if ($to === '') {
                continue;
            }

            $items[] = ['from' => $from, 'to' => $to];
        }

        return $items;
    }

    private function redirectSource(string $source, string $dir, SiteLocale $locale): ?string
    {
        $path = $this->redirectPath($source, $locale);
        if ($path === null) {
            return null;
        }

        $path = $this->normalizeRedirectRelativePath($path, $dir);
        if ($path === null) {
            return null;
        }

        return $this->isContentFile($path) ? $this->stripContentExtension($path) : $path;
    }

    /**
     * @param array<string,array<string,mixed>> $documents
     * @param array<string,array<string,mixed>> $pages
     * @return array{slug:string,href:string}|null
     */
    private function redirectDestination(string $destination, string $dir, array $documents, array $pages, SiteLocale $locale): ?array
    {
        $fragment = parse_url($destination, PHP_URL_FRAGMENT);
        $path     = $this->redirectPath($destination, $locale);
        if ($path === null) {
            return null;
        }

        $path = $this->normalizeRedirectRelativePath($path, $dir);
        if ($path === null) {
            return null;
        }

        if ($this->isContentFile($path)) {
            $document = $documents[$path] ?? null;
            if (!is_array($document)) {
                return null;
            }

            $slug = (string) ($document['slug'] ?? '');
            $href = (string) ($document['href'] ?? '');
        } else {
            $slug = $this->normalizeSlug($path);
            $href = (string) ($pages[$slug]['href'] ?? '');
        }

        if ($slug === '' || $href === '' || !isset($pages[$slug])) {
            return null;
        }

        if (is_string($fragment) && $fragment !== '') {
            $href .= '#' . rawurlencode($fragment);
        }

        return ['slug' => $slug, 'href' => $href];
    }

    private function redirectPath(string $target, SiteLocale $locale): ?string
    {
        $target = trim($target);
        if ($target === '' || preg_match('~^[a-z][a-z0-9+.-]*:~i', $target) === 1 || str_starts_with($target, '//')) {
            return null;
        }

        $path = parse_url($target, PHP_URL_PATH);
        $path = is_string($path) ? $path : $target;

        $docsPrefix = $locale->url('/docs');
        if ($path === $docsPrefix || str_starts_with($path, $docsPrefix . '/')) {
            return '/docs/' . trim((string) preg_replace('~^' . preg_quote($docsPrefix, '~') . '/?~', '', $path), '/');
        }

        if (str_starts_with($path, '/docs/')) {
            return $path;
        }

        if (str_starts_with($path, '/')) {
            return null;
        }

        return $path;
    }

    private function normalizeRedirectRelativePath(string $path, string $dir): ?string
    {
        $path = str_replace('\\', '/', trim($path));
        if ($path === '' || $path === '.') {
            return null;
        }

        if (str_starts_with($path, '/docs/')) {
            return $this->normalizeSlug($path);
        }

        $candidate = trim(($dir === '' ? '' : $dir . '/') . $path, '/');
        $candidate = preg_replace('~/+~', '/', $candidate) ?? $candidate;
        $segments  = [];

        foreach (explode('/', $candidate) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }

            if ($segment === '..') {
                if ($segments === []) {
                    return null;
                }
                array_pop($segments);
                continue;
            }

            $segments[] = $segment;
        }

        $normalized = implode('/', $segments);

        return $normalized === '' || str_contains($normalized, "\0") ? null : $normalized;
    }

    private function categoryMetadataPath(string $dir): string
    {
        return $dir === '' ? 'index.json' : $dir . '/index.json';
    }

    private function docsHref(string $slug, SiteLocale $locale, ?array $version = null): string
    {
        $slug = $this->normalizeSlug($slug);

        $prefix = $this->docsUrlPrefix($locale, $version);

        return $slug === '' ? $prefix : $prefix . '/' . $slug;
    }

    private function docsUrlPrefix(SiteLocale $locale, ?array $version = null): string
    {
        $code = $this->versionCode($version);
        if ($code !== '' && ($version['status'] ?? '') === 'supported') {
            return $locale->url('/docs/v/' . $code);
        }

        return $locale->url('/docs');
    }

    private function versionCode(?array $version): string
    {
        return is_array($version) ? $this->stringValue($version['version'] ?? '') : '';
    }

    private function versionDocsEnabled(?array $version): bool
    {
        return is_array($version) && in_array(($version['status'] ?? ''), ['current', 'supported'], true);
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     * @return array<string,mixed>
     */
    private function versions(SiteLocale $locale, array &$diagnostics, ?string $selectedVersion = null): array
    {
        $config = $this->readVersionsConfig($locale, $diagnostics);
        $items  = is_array($config['versions'] ?? null) ? array_values($config['versions']) : [];

        if ($items === []) {
            return [
                'enabled'  => false,
                'current'  => '',
                'selected' => null,
                'all_href' => $locale->url('/docs/versions'),
                'items'    => [],
            ];
        }

        $current = $this->stringValue($config['current'] ?? '');
        if ($current === '') {
            foreach ($items as $item) {
                if (is_array($item) && $this->stringValue($item['status'] ?? '') === 'current') {
                    $current = $this->stringValue($item['version'] ?? '');
                    break;
                }
            }
        }

        if ($current === '' && is_array($items[0] ?? null)) {
            $current = $this->stringValue($items[0]['version'] ?? '');
        }

        $normalized = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $version = $this->stringValue($item['version'] ?? '');
            if ($version === '') {
                continue;
            }

            $status = $this->normalizeVersionStatus($this->stringValue($item['status'] ?? ''), $version, $current);
            $href   = match ($status) {
                'current'   => $locale->url('/docs'),
                'supported' => $locale->url('/docs/v/' . $version),
                default     => '',
            };

            $normalized[] = [
                'version'      => $version,
                'label'        => $this->stringValue($item['label'] ?? '') ?: $version,
                'status'       => $status,
                'href'         => $href,
                'docs_enabled' => in_array($status, ['current', 'supported'], true),
                'archived_at'  => $this->stringValue($item['archived_at'] ?? ''),
                'released_at'  => $this->stringValue($item['released_at'] ?? ''),
            ];
        }

        $selectedCode = $selectedVersion ?: $current;
        $selected     = $this->findVersion($normalized, $selectedCode);
        foreach ($normalized as $index => $item) {
            $normalized[$index]['current'] = $selected !== null && $item['version'] === ($selected['version'] ?? null);
        }
        $selected = $this->findVersion($normalized, $selectedCode);

        return [
            'enabled'  => true,
            'current'  => $current,
            'selected' => $selected,
            'all_href' => $locale->url('/docs/versions'),
            'items'    => $normalized,
        ];
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     * @return array<string,mixed>
     */
    private function readVersionsConfig(SiteLocale $locale, array &$diagnostics): array
    {
        $path = self::VERSION_CONFIG_PATH;
        if ($this->locales->hasSiteDisk()) {
            $path = $locale->contentPath('docs', self::VERSION_CONFIG_PATH);
            $disk = $this->storage->disk(SiteStorage::SITE_DISK);
        } else {
            $disk = $this->docs();
        }

        if ($disk->missing($path)) {
            return [];
        }

        try {
            $config = json_decode($disk->read($path), true, 512, JSON_THROW_ON_ERROR);

            return is_array($config) ? $config : [];
        } catch (JsonException $exception) {
            $diagnostics[] = [
                'level'   => 'error',
                'code'    => 'versions.invalid_json',
                'message' => $exception->getMessage(),
                'path'    => self::VERSION_CONFIG_PATH,
                'line'    => null,
            ];

            return [];
        }
    }

    private function normalizeVersionStatus(string $status, string $version, string $current): string
    {
        if ($version === $current || $status === 'current') {
            return 'current';
        }

        return in_array($status, ['supported', 'archived'], true) ? $status : 'supported';
    }

    private function cacheKey(?string $localeCode, ?string $versionCode, string $fingerprint): ?string
    {
        if ($this->cache === null || $this->path === null || !$this->cacheEnabled()) {
            return null;
        }

        return 'documentation_index_' . hash('sha256', implode('|', [
            self::CACHE_VERSION,
            $localeCode ?? 'default',
            $versionCode ?? 'current',
            $fingerprint,
        ]));
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

    private function contentFingerprint(?SiteLocale $locale = null): string
    {
        $root = $this->path?->storagePath('edoc');
        if (!is_string($root) || !is_dir($root)) {
            return 'missing';
        }

        $root     = str_replace('\\', '/', $root);
        $root     = str_ends_with($root, '/') ? substr($root, 0, -1) : $root;
        $cacheKey = $root . '|' . ($locale?->code ?? 'missing');
        if (isset($this->fingerprintCache[$cacheKey])) {
            return $this->fingerprintCache[$cacheKey];
        }

        $signature = [];

        $this->appendFingerprintFile($root, 'site.json', $signature);

        if ($locale !== null) {
            $this->appendFingerprintFile($root, $locale->contentPath('site.json'), $signature);
            $this->appendFingerprintDirectory($root, $locale->contentPath('docs'), $signature);
        }

        sort($signature, SORT_STRING);

        return $this->fingerprintCache[$cacheKey] = hash('sha256', implode('|', $signature));
    }

    /**
     * @param list<string> $signature
     */
    private function appendFingerprintDirectory(string $root, string $relativeDirectory, array &$signature): void
    {
        $relativeDirectory = trim($relativeDirectory, '/');
        $directory         = $relativeDirectory === '' ? $root : $root . '/' . $relativeDirectory;
        if (!is_dir($directory)) {
            return;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
        );

        foreach ($iterator as $item) {
            if (!$item instanceof SplFileInfo || !$item->isFile()) {
                continue;
            }

            $path = str_replace('\\', '/', $item->getPathname());
            if (!str_starts_with($path, $root . '/')) {
                continue;
            }

            $relative = substr($path, strlen($root) + 1);
            if ($this->isIgnoredFingerprintPath($relative) || !$this->isCacheTrackedContentPath($relative)) {
                continue;
            }

            $this->appendFingerprintPath($path, $relative, $signature);
        }
    }

    /**
     * @param list<string> $signature
     */
    private function appendFingerprintFile(string $root, string $relativeFile, array &$signature): void
    {
        $relativeFile = trim($relativeFile, '/');
        if ($relativeFile === '') {
            return;
        }

        $path = $root . '/' . $relativeFile;
        if (!is_file($path) || $this->isIgnoredFingerprintPath($relativeFile)) {
            return;
        }

        $this->appendFingerprintPath($path, $relativeFile, $signature);
    }

    /**
     * @param list<string> $signature
     */
    private function appendFingerprintPath(string $path, string $relative, array &$signature): void
    {
        $mtime = filemtime($path);
        $size  = filesize($path);

        $signature[] = $relative . ':' . (int) $size . ':' . (int) $mtime;
    }

    private function isIgnoredFingerprintPath(string $path): bool
    {
        return str_starts_with($path, '.git/')
            || str_contains($path, '/.git/')
            || str_starts_with($path, 'static/')
            || str_starts_with($path, 'pages/');
    }

    private function isCacheTrackedContentPath(string $path): bool
    {
        return str_ends_with($path, '.md') || str_ends_with($path, '.mdx') || str_ends_with($path, '.json');
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

    /**
     * @param list<array<string,mixed>> $versions
     * @return array<string,mixed>|null
     */
    private function findVersion(array $versions, string $version): ?array
    {
        foreach ($versions as $item) {
            if (($item['version'] ?? null) === $version) {
                return $item;
            }
        }

        return null;
    }

    /**
     * @param array<string,mixed> $versions
     * @return array<string,mixed>|null
     */
    private function selectedVersion(array $versions): ?array
    {
        return is_array($versions['selected'] ?? null) ? $versions['selected'] : null;
    }

    /**
     * @param array<string,mixed> $metadata
     */
    private function versionAllows(array $metadata, ?array $version): bool
    {
        $code = $this->versionCode($version);
        if ($code === '') {
            return true;
        }

        $since = $this->stringValue($metadata['since'] ?? '');
        if ($since !== '' && $this->compareVersions($code, $since) < 0) {
            return false;
        }

        $until = $this->stringValue($metadata['until'] ?? '');
        if ($until !== '' && $this->compareVersions($code, $until) > 0) {
            return false;
        }

        return true;
    }

    private function compareVersions(string $left, string $right): int
    {
        $leftParts  = $this->versionParts($left);
        $rightParts = $this->versionParts($right);
        $length     = max(count($leftParts), count($rightParts));

        for ($index = 0; $index < $length; $index++) {
            $leftPart  = $leftParts[$index] ?? 0;
            $rightPart = $rightParts[$index] ?? 0;
            if ($leftPart === $rightPart) {
                continue;
            }

            return $leftPart <=> $rightPart;
        }

        return 0;
    }

    /**
     * @return list<int>
     */
    private function versionParts(string $version): array
    {
        $parts = preg_split('~[^\d]+~', $version) ?: [];
        $parts = array_values(array_filter($parts, static fn (string $part): bool => $part !== ''));

        return array_map(static fn (string $part): int => (int) $part, $parts);
    }

    private function normalizeDocPath(string $path): ?string
    {
        $path = $this->normalizeRelativePath($path);
        if ($path === null || $path === '') {
            return null;
        }

        if ($this->isContentFile($path)) {
            return $path;
        }

        return $path . '.md';
    }

    private function normalizeRelativePath(string $path): ?string
    {
        $path = str_replace('\\', '/', trim($path));
        $path = trim($path, '/');
        $path = preg_replace('~/+~', '/', $path) ?? $path;

        if ($path === '' || $path === '.' || str_starts_with($path, '../') || str_contains($path, '/../') || str_ends_with($path, '/..')) {
            return null;
        }

        return $path;
    }

    private function directory(string $path): string
    {
        $dir = dirname($path);

        return $dir === '.' ? '' : $this->normalizeSlug($dir);
    }

    /**
     * @return list<string>
     */
    private function directoryAncestors(string $dir): array
    {
        $parts     = explode('/', $dir);
        $ancestors = [];
        $current   = [];

        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }
            $current[]   = $part;
            $ancestors[] = implode('/', $current);
        }

        return $ancestors;
    }

    private function isCategoryFile(string $path): bool
    {
        return basename($path) === 'index.json' || basename($path) === '_category_.json';
    }

    private function isIgnoredPath(string $path): bool
    {
        if ($path === self::VERSION_CONFIG_PATH) {
            return true;
        }

        $segments = explode('/', $path);
        foreach ($segments as $index => $segment) {
            if ($segment === self::VERSIONED_DOCS_DIR) {
                return true;
            }

            if ($segment === '' || $segment === '.' || str_starts_with($segment, '.')) {
                return true;
            }

            if ($index === count($segments) - 1 && $segment === '_category_.json') {
                continue;
            }

            if (str_starts_with($segment, '_')) {
                return true;
            }
        }

        return false;
    }

    private function isContentFile(string $path): bool
    {
        return str_ends_with($path, '.md') || str_ends_with($path, '.mdx');
    }

    private function isIndexFile(string $path): bool
    {
        return basename($path) === 'index.md' || basename($path) === 'index.mdx';
    }

    /**
     * @param array<string,array<string,mixed>> $documents
     */
    private function indexDocumentPath(string $dir, array $documents): ?string
    {
        $prefix = $dir === '' ? '' : $dir . '/';

        foreach (['index.md', 'index.mdx'] as $name) {
            $path = $prefix . $name;
            if (isset($documents[$path])) {
                return $path;
            }
        }

        return null;
    }

    private function contentFormat(string $path): string
    {
        return str_ends_with($path, '.mdx') ? 'mdx' : 'markdown';
    }

    private function stripContentExtension(string $path): string
    {
        if (str_ends_with($path, '.mdx')) {
            return substr($path, 0, -4);
        }

        return str_ends_with($path, '.md') ? substr($path, 0, -3) : $path;
    }

    private function firstHeading(string $body): ?string
    {
        if (preg_match('/^\s*#\s+(.+)$/m', $body, $matches) === 1) {
            return trim((string) $matches[1]);
        }

        return null;
    }

    private function humanize(string $value): string
    {
        $value = trim((string) preg_replace('~[-_]+~', ' ', $value));
        if ($value === '') {
            return 'Документ';
        }

        return mb_strtoupper(substr($value, 0, 1)) . substr($value, 1);
    }

    private function stringValue(mixed $value): string
    {
        return is_string($value) ? trim($value) : '';
    }

    private function numberValue(mixed $value): int|null
    {
        return is_numeric($value) ? (int) $value : null;
    }

    private function boolValue(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            return in_array(trim($value), ['1', 'true', 'yes', 'on'], true);
        }

        return (bool) $value;
    }

    private function searchText(string $body): string
    {
        return implode(' ', $this->searchContexts($body));
    }

    /**
     * @return list<string>
     */
    private function searchContexts(string $body): array
    {
        $contexts = [];

        foreach ($this->searchableLines($body) as $line) {
            $context = $this->normalizeSearchLine($line);
            if ($context === '' || in_array($context, $contexts, true)) {
                continue;
            }

            $contexts[] = $context;
            if (count($contexts) >= 40) {
                break;
            }
        }

        if ($contexts === []) {
            $context = $this->normalizeSearchLine($body);
            if ($context !== '') {
                $contexts[] = $context;
            }
        }

        return $contexts;
    }

    /**
     * @return list<string>
     */
    private function searchableLines(string $body): array
    {
        $lines    = preg_split('~\R~u', $body) ?: [];
        $result   = [];
        $inFence  = false;
        $inImport = false;
        $inJsxTag = false;

        foreach ($lines as $line) {
            $trimmed = trim($line);

            if (str_starts_with($trimmed, '```') || str_starts_with($trimmed, '~~~')) {
                $inFence = !$inFence;
                continue;
            }

            if ($inFence || $trimmed === '') {
                continue;
            }

            if ($inImport) {
                if (preg_match('~\sfrom\s+[\'"]~', $trimmed) === 1 || str_ends_with($trimmed, ';')) {
                    $inImport = false;
                }
                continue;
            }

            if (preg_match('~^import(?:\s|[{\w*])~', $trimmed) === 1) {
                if (preg_match('~\sfrom\s+[\'"]~', $trimmed) !== 1 && !str_ends_with($trimmed, ';')) {
                    $inImport = true;
                }
                continue;
            }

            if (preg_match('~^export(?:\s|[{\w*])~', $trimmed) === 1) {
                continue;
            }

            if ($inJsxTag) {
                if (str_contains($trimmed, '>')) {
                    $inJsxTag = false;
                }
                continue;
            }

            if (preg_match('~^</?[A-Z][A-Za-z0-9_.:-]*(?:\s|>|/)~', $trimmed) === 1) {
                if (!str_contains($trimmed, '>')) {
                    $inJsxTag = true;
                }

                $line = preg_replace('~</?[A-Z][A-Za-z0-9_.:-]*(?:\s[^<>]*)?>~', ' ', $line) ?? $line;
                if (trim($line) === '') {
                    continue;
                }
            }

            $result[] = $line;
        }

        return $result;
    }

    private function normalizeSearchLine(string $line): string
    {
        $line = preg_replace('~`([^`]+)`~', '$1', $line) ?? $line;
        $line = preg_replace('~!\[[^\]]*]\([^)]*\)~', ' ', $line) ?? $line;
        $line = preg_replace('~\[([^\]]+)]\([^)]*\)~', '$1', $line) ?? $line;
        $line = preg_replace('~<[^>]+>~', ' ', $line) ?? $line;
        $line = preg_replace('~\{[^{}\r\n]*}~', ' ', $line) ?? $line;
        $line = preg_replace('~[#>*_\-\~|]+~', ' ', $line) ?? $line;
        $line = strip_tags($line);
        $line = preg_replace('~\s+~u', ' ', $line) ?? $line;

        return trim($line);
    }

    /**
     * @return list<string>
     */
    private function stringList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $items = [];
        foreach ($value as $item) {
            if (!is_string($item)) {
                continue;
            }

            $item = trim($item);
            if ($item !== '') {
                $items[] = $item;
            }
        }

        return $items;
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     * @return array{frontMatter:array<string,mixed>,body:string}
     */
    private function parseSource(string $path, string $source, array &$diagnostics): array
    {
        if ($this->contentFormat($path) === 'mdx') {
            $parsed = $this->mdxFrontMatterParser->parse($source);

            foreach ($parsed->diagnostics() as $diagnostic) {
                $diagnostics[] = $this->mdxDiagnosticToArray($diagnostic, $path);
            }

            return [
                'frontMatter' => $parsed->frontMatter(),
                'body'        => $parsed->body(),
            ];
        }

        $parsed = $this->frontMatterParser->parse($source);

        foreach ($parsed->diagnostics() as $diagnostic) {
            $diagnostics[] = $this->diagnosticToArray($diagnostic, $path);
        }

        return [
            'frontMatter' => $parsed->frontMatter(),
            'body'        => $parsed->body(),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    private function diagnosticToArray(MarkdownDiagnostic $diagnostic, string $path): array
    {
        return [
            'level'   => $diagnostic->level()->value,
            'code'    => $diagnostic->code(),
            'message' => $diagnostic->message(),
            'path'    => $path,
            'line'    => $diagnostic->line(),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    private function mdxDiagnosticToArray(MdxDiagnostic $diagnostic, string $path): array
    {
        return [
            'level'   => $diagnostic->level()->value,
            'code'    => $diagnostic->code(),
            'message' => $diagnostic->message(),
            'path'    => $path,
            'line'    => $diagnostic->line(),
        ];
    }

    private function docs(): StorageInterface
    {
        return $this->storage->disk(DocumentationStorage::DOCS_DISK);
    }

    /**
     * @return array{
     *     sidebars:list<array<string,string>>,
     *     tree:list<array<string,mixed>>,
     *     pages:array<string,array<string,mixed>>,
     *     categories:array<string,array<string,mixed>>,
     *     documents_by_path:array<string,array<string,mixed>>,
     *     redirects:array<string,array<string,mixed>>,
     *     search_entries:list<array<string,mixed>>,
     *     flat_pages:list<array<string,mixed>>,
     *     first_sidebar_slug:null,
     *     first_slug:null,
     *     diagnostics:list<array<string,mixed>>
     * }
     */
    private function emptyIndex(): array
    {
        return [
            'sidebars'            => [],
            'tree'                => [],
            'pages'               => [],
            'categories'          => [],
            'documents_by_path'   => [],
            'redirects'           => [],
            'search_entries'      => [],
            'flat_pages'          => [],
            'first_sidebar_slug'  => null,
            'first_slug'          => null,
            'content_fingerprint' => '',
            'versions'            => [
                'enabled'  => false,
                'current'  => '',
                'selected' => null,
                'all_href' => '/docs/versions',
                'items'    => [],
            ],
            'diagnostics' => [],
        ];
    }

    /**
     * @return array<string,array{storage_path:string,module_path:string}>
     */
    private function contentFileSources(SiteLocale $locale, ?array $version): array
    {
        $sources = [];
        foreach ($this->contentFiles($locale) as $file) {
            $path = $this->normalizeRelativePath($file);
            if ($path === null) {
                continue;
            }

            $sources[$path] = [
                'storage_path' => $this->contentPath($locale, $path),
                'module_path'  => $this->modulePath($locale, $path),
            ];
        }

        if (($version['status'] ?? '') !== 'supported') {
            return $sources;
        }

        $versionCode = $this->versionCode($version);
        foreach ($this->overrideFiles($locale, $versionCode) as $target => $overridePath) {
            $sources[$target] = [
                'storage_path' => $this->contentPath($locale, $overridePath),
                'module_path'  => $this->modulePath($locale, $overridePath),
            ];
        }

        return $sources;
    }

    /**
     * @return array<string,string>
     */
    private function overrideFiles(SiteLocale $locale, string $version): array
    {
        if ($version === '') {
            return [];
        }

        $prefix = self::VERSIONED_DOCS_DIR . '/' . $version . '/' . self::OVERRIDES_DIR;
        $disk   = $this->locales->hasSiteDisk()
            ? $this->storage->disk(SiteStorage::SITE_DISK)
            : $this->docs();
        $storagePath = $this->locales->hasSiteDisk()
            ? $locale->contentPath('docs', $prefix)
            : $prefix;
        $files = $disk->list($storagePath);

        $overrides = [];
        foreach ($files as $file) {
            $path = $this->locales->hasSiteDisk()
                ? $locale->stripContentPath('docs', $file)
                : $file;

            $path = $this->normalizeRelativePath($path);
            if ($path === null) {
                continue;
            }

            $target = str_starts_with($path, $prefix . '/')
                ? substr($path, strlen($prefix) + 1)
                : $path;
            $target = $this->normalizeRelativePath($target);
            if ($target === null || $target === self::VERSION_CONFIG_PATH || str_starts_with($target, self::VERSIONED_DOCS_DIR . '/')) {
                continue;
            }

            $overrides[$target] = $path;
        }

        return $overrides;
    }

    /**
     * @return list<string>
     */
    private function contentFiles(SiteLocale $locale): array
    {
        if (!$this->locales->hasSiteDisk()) {
            return $locale->default ? $this->docs()->list() : [];
        }

        $files  = $this->storage->disk(SiteStorage::SITE_DISK)->list($locale->contentPath('docs'));
        $result = [];

        foreach ($files as $file) {
            $result[] = $locale->stripContentPath('docs', $file);
        }

        return $result;
    }

    private function readContent(SiteLocale $locale, string $storagePath): string
    {
        if (!$this->locales->hasSiteDisk()) {
            return $this->docs()->read($storagePath);
        }

        return $this->storage->disk(SiteStorage::SITE_DISK)->read($storagePath);
    }

    private function contentPath(SiteLocale $locale, string $path): string
    {
        return $this->locales->hasSiteDisk() ? $locale->contentPath('docs', $path) : $path;
    }

    private function modulePath(SiteLocale $locale, string $path): string
    {
        return $this->locales->hasSiteDisk()
            ? $locale->modulePath('docs', $path)
            : '/local/storage/edoc/ru/docs/' . $path;
    }
}
