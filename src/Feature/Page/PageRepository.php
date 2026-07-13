<?php

declare(strict_types=1);

namespace App\Feature\Page;

use App\Feature\Content\ContentRendererInterface;
use App\Feature\Content\ContentRenderOptions;
use App\Feature\Site\SiteLocale;
use App\Feature\Site\SiteLocaleResolver;
use App\Feature\Site\SiteStorage;
use PhpSoftBox\Markdown\MarkdownHtmlPolicy;
use PhpSoftBox\Markdown\YamlFrontMatterParser;
use PhpSoftBox\Mdx\MdxDiagnostic;
use PhpSoftBox\Mdx\YamlMdxFrontMatterParser;
use PhpSoftBox\Storage\Contracts\StorageInterface;
use PhpSoftBox\Storage\Storage;

use function basename;
use function dirname;
use function explode;
use function in_array;
use function is_bool;
use function is_numeric;
use function is_string;
use function pathinfo;
use function preg_match;
use function preg_replace;
use function sort;
use function str_contains;
use function str_ends_with;
use function str_replace;
use function str_starts_with;
use function substr;
use function trim;
use function usort;

use const PATHINFO_FILENAME;
use const SORT_STRING;

final readonly class PageRepository
{
    private SiteLocaleResolver $locales;

    public function __construct(
        private Storage $storage,
        private ContentRendererInterface $renderer,
        ?SiteLocaleResolver $locales = null,
        private YamlFrontMatterParser $frontMatterParser = new YamlFrontMatterParser(),
        private YamlMdxFrontMatterParser $mdxFrontMatterParser = new YamlMdxFrontMatterParser(),
    ) {
        $this->locales = $locales ?? new SiteLocaleResolver($this->storage);
    }

    public function hasHomePage(?string $localeCode = null): bool
    {
        $locale = $this->locales->byCode($localeCode);
        if ($locale === null) {
            return false;
        }

        $index = $this->buildIndex($locale);

        return isset($index['pages']['']);
    }

    /**
     * @return list<array<string,string>>
     */
    public function navigation(?string $localeCode = null): array
    {
        $locale = $this->locales->byCode($localeCode);
        if ($locale === null) {
            return [];
        }

        return $this->buildIndex($locale)['navigation'];
    }

    /**
     * @return array{
     *     navigation:list<array<string,string>>,
     *     current:array<string,mixed>,
     *     document:array<string,mixed>,
     *     diagnostics:list<array<string,mixed>>
     * }
     */
    public function publicView(?string $slugPath, ?string $localeCode = null): array
    {
        $locale = $this->locales->byCode($localeCode);
        if ($locale === null) {
            throw PageException::notFound();
        }

        $index = $this->buildIndex($locale);
        $slug  = $this->normalizeSlug($slugPath ?? '');

        $current = $index['pages'][$slug] ?? null;
        if ($current === null) {
            throw PageException::notFound();
        }

        $document = $this->renderPageDocument($current, $index, $locale);

        return [
            'navigation'  => $index['navigation'],
            'current'     => $current,
            'document'    => $document,
            'diagnostics' => [...$index['diagnostics'], ...$document['diagnostics']],
        ];
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
            $index = $this->buildIndex($locale);
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
     * @return array{
     *     pages:array<string,array<string,mixed>>,
     *     pages_by_path:array<string,array<string,mixed>>,
     *     navigation:list<array<string,string>>,
     *     diagnostics:list<array<string,mixed>>
     * }
     */
    private function buildIndex(SiteLocale $locale): array
    {
        $files = $this->contentFiles($locale);
        sort($files, SORT_STRING);

        $pages       = [];
        $pagesByPath = [];
        $diagnostics = [];

        foreach ($files as $file) {
            $path = $this->normalizeRelativePath($file);
            if ($path === null || $this->isIgnoredPath($path) || !$this->isContentFile($path)) {
                continue;
            }

            $page = $this->readPageMetadata($path, $diagnostics, $locale);
            if ($page === null) {
                continue;
            }

            $slug = (string) $page['slug'];
            if (isset($pages[$slug])) {
                $diagnostics[] = [
                    'level'   => 'error',
                    'code'    => 'page.slug_duplicate',
                    'message' => 'Duplicate page slug: ' . $slug,
                    'path'    => $path,
                    'line'    => null,
                ];
                continue;
            }

            $pages[$slug]       = $page;
            $pagesByPath[$path] = $page;
        }

        return [
            'pages'         => $pages,
            'pages_by_path' => $pagesByPath,
            'navigation'    => $this->buildNavigation($pages),
            'diagnostics'   => $diagnostics,
        ];
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     * @return array<string,mixed>|null
     */
    private function readPageMetadata(string $path, array &$diagnostics, SiteLocale $locale): ?array
    {
        $source = $this->readContent($locale, $path);
        $parsed = $this->parseSource($path, $source, $diagnostics);

        $frontMatter = $parsed['frontMatter'];
        $defaultSlug = $this->isIndexFile($path)
            ? $this->directory($path)
            : $this->stripContentExtension($path);
        $slug  = $this->normalizeSlug($this->stringValue($frontMatter['slug'] ?? '') ?: $defaultSlug);
        $title = $this->stringValue($frontMatter['title'] ?? '')
            ?: $this->firstHeading($parsed['body'])
            ?: $this->humanize(pathinfo($path, PATHINFO_FILENAME));

        return [
            'id'              => 'page:' . $path,
            'kind'            => 'page',
            'type'            => 'page',
            'title'           => $title,
            'label'           => $this->stringValue($frontMatter['nav_label'] ?? '') ?: $title,
            'slug'            => $slug,
            'href'            => $locale->url($slug === '' ? '/' : '/' . $slug),
            'path'            => $path,
            'source_path'     => $path,
            'document_path'   => $path,
            'storage_path'    => $this->contentPath($locale, $path),
            'module_path'     => $this->modulePath($locale, $path),
            'format'          => $this->contentFormat($path),
            'layout'          => $this->stringValue($frontMatter['layout'] ?? '') ?: 'page',
            'container'       => $this->pageContainer($frontMatter['container'] ?? null),
            'description'     => $this->stringValue($frontMatter['description'] ?? ''),
            'translation_key' => $this->stringValue($frontMatter['translation_key'] ?? ''),
            'nav_label'       => $this->stringValue($frontMatter['nav_label'] ?? ''),
            'nav_position'    => $this->numberValue($frontMatter['nav_position'] ?? null),
            'nav_hidden'      => $this->boolValue($frontMatter['nav_hidden'] ?? false),
            'header_hidden'   => $this->boolValue($frontMatter['header_hidden'] ?? false),
        ];
    }

    /**
     * @param array<string,mixed> $current
     * @param array<string,mixed> $index
     * @return array<string,mixed>
     */
    private function renderPageDocument(array $current, array $index, SiteLocale $locale): array
    {
        $path   = (string) $current['document_path'];
        $source = $this->readContent($locale, $path);

        if (($current['format'] ?? 'markdown') === 'mdx') {
            $diagnostics = [];
            $this->parseSource($path, $source, $diagnostics);

            return [
                'kind'        => 'page',
                'format'      => 'mdx',
                'module'      => (string) ($current['module_path'] ?? $locale->modulePath('pages', $path)),
                'html'        => '',
                'toc'         => [],
                'diagnostics' => $diagnostics,
            ];
        }

        $resolver = new PageMarkdownLinkResolver(
            pagesByPath: $index['pages_by_path'],
            pagesBySlug: $index['pages'],
            storage: $this->storage,
            staticDisk: $this->staticDisk(),
            staticPrefix: $this->staticPrefix($locale),
            docsUrlPrefix: $locale->url('/docs'),
        );

        $document = $this->renderer->render($source, new ContentRenderOptions(
            path: $path,
            linkResolver: $resolver,
            htmlPolicy: MarkdownHtmlPolicy::Escape,
            tocMinHeadingLevel: 2,
            tocMaxHeadingLevel: 3,
            externalLinkTarget: '_blank',
            externalLinksNoFollow: true,
        ));

        return [
            'kind'        => 'page',
            'format'      => 'markdown',
            'html'        => $document->html,
            'toc'         => $document->toc,
            'diagnostics' => $document->diagnostics,
        ];
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
            $diagnostics[] = [
                'level'   => $diagnostic->level()->value,
                'code'    => $diagnostic->code(),
                'message' => $diagnostic->message(),
                'path'    => $path,
                'line'    => $diagnostic->line(),
            ];
        }

        return [
            'frontMatter' => $parsed->frontMatter(),
            'body'        => $parsed->body(),
        ];
    }

    /**
     * @param array<string,array<string,mixed>> $pages
     * @return list<array<string,string>>
     */
    private function buildNavigation(array $pages): array
    {
        $items = [];
        foreach ($pages as $page) {
            if (($page['nav_hidden'] ?? false) === true || ($page['nav_label'] ?? '') === '') {
                continue;
            }

            $items[] = $page;
        }

        usort($items, static function (array $a, array $b): int {
            $aPosition = $a['nav_position'] ?? null;
            $bPosition = $b['nav_position'] ?? null;

            if ($aPosition !== null || $bPosition !== null) {
                return ($aPosition ?? 1_000_000) <=> ($bPosition ?? 1_000_000);
            }

            return ((string) ($a['label'] ?? '')) <=> ((string) ($b['label'] ?? ''));
        });

        $navigation = [];
        foreach ($items as $item) {
            $navigation[] = [
                'title'         => (string) ($item['title'] ?? ''),
                'label'         => (string) ($item['label'] ?? $item['title'] ?? ''),
                'href'          => (string) ($item['href'] ?? ''),
                'header_hidden' => (bool) ($item['header_hidden'] ?? false),
            ];
        }

        return $navigation;
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

    private function normalizeSlug(string $path): string
    {
        $path = str_replace('\\', '/', trim($path));
        $path = preg_replace('~^/?~', '', $path) ?? $path;
        $path = trim($path, '/');
        $path = preg_replace('~/+~', '/', $path) ?? $path;

        if ($path === '.' || $path === 'index') {
            return '';
        }

        return $path;
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

    private function isIgnoredPath(string $path): bool
    {
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.' || str_starts_with($segment, '.') || str_starts_with($segment, '_')) {
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

    private function contentFormat(string $path): string
    {
        return str_ends_with($path, '.mdx') ? 'mdx' : 'markdown';
    }

    private function pageContainer(mixed $value): string
    {
        $container = $this->stringValue($value);

        return in_array($container, ['fluid', 'constrained', 'wide', 'narrow'], true)
            ? $container
            : 'fluid';
    }

    private function stripContentExtension(string $path): string
    {
        if (str_ends_with($path, '.mdx')) {
            return substr($path, 0, -4);
        }

        return str_ends_with($path, '.md') ? substr($path, 0, -3) : $path;
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

        return $value === '' ? 'Страница' : $value;
    }

    private function stringValue(mixed $value): string
    {
        return is_string($value) ? trim($value) : '';
    }

    private function numberValue(mixed $value): ?int
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

    private function pages(): StorageInterface
    {
        return $this->storage->disk(PageStorage::PAGES_DISK);
    }

    /**
     * @return list<string>
     */
    private function contentFiles(SiteLocale $locale): array
    {
        if (!$this->locales->hasSiteDisk()) {
            return $locale->default ? $this->pages()->list() : [];
        }

        $root  = $locale->contentPath('pages');
        $files = $this->storage->disk(SiteStorage::SITE_DISK)->list($root);

        $result = [];
        foreach ($files as $file) {
            $result[] = $locale->stripContentPath('pages', $file);
        }

        return $result;
    }

    private function readContent(SiteLocale $locale, string $path): string
    {
        if (!$this->locales->hasSiteDisk()) {
            return $this->pages()->read($path);
        }

        return $this->storage->disk(SiteStorage::SITE_DISK)->read($this->contentPath($locale, $path));
    }

    private function contentPath(SiteLocale $locale, string $path): string
    {
        return $this->locales->hasSiteDisk() ? $locale->contentPath('pages', $path) : $path;
    }

    private function modulePath(SiteLocale $locale, string $path): string
    {
        return $this->locales->hasSiteDisk()
            ? $locale->modulePath('pages', $path)
            : '/local/storage/edoc/ru/pages/' . $path;
    }

    private function staticDisk(): string
    {
        return $this->locales->hasSiteDisk() ? SiteStorage::SITE_DISK : PageStorage::STATIC_DISK;
    }

    private function staticPrefix(SiteLocale $locale): string
    {
        return $this->locales->hasSiteDisk() ? 'static' : '';
    }
}
