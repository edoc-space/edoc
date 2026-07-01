<?php

declare(strict_types=1);

namespace App\Feature\Documentation;

use function is_array;
use function preg_match;
use function str_starts_with;

final readonly class DocumentationRepository
{
    public function __construct(
        private DocumentationIndexBuilder $indexBuilder,
        private DocumentationNavigation $navigation,
        private DocumentationRenderer $renderer,
    ) {
    }

    /**
     * @return list<array<string,string>>
     */
    public function navigation(?string $localeCode = null): array
    {
        return $this->indexBuilder->build($localeCode)['sidebars'];
    }

    /**
     * @return array{
     *     sidebars:list<array<string,string>>,
     *     active_sidebar:array<string,string>|null,
     *     tree:list<array<string,mixed>>,
     *     current:array<string,mixed>|null,
     *     document:array<string,mixed>|null,
     *     breadcrumbs:list<array<string,string>>,
     *     toc:list<array<string,mixed>>,
     *     diagnostics:list<array<string,mixed>>,
     *     search:list<array<string,mixed>>,
     *     not_found:array<string,string>|null,
     *     prev:array<string,string>|null,
     *     next:array<string,string>|null
     * }
     */
    public function publicView(?string $slugPath, ?string $localeCode = null): array
    {
        $request = $this->versionedRequest($slugPath);
        $index   = $this->indexBuilder->build($localeCode, $request['version']);

        if ($request['versions_index']) {
            return $this->versionsIndexView($index, $localeCode);
        }

        $selectedVersion = is_array($index['versions']['selected'] ?? null) ? $index['versions']['selected'] : null;
        if ($request['version'] !== null && $selectedVersion === null) {
            throw DocumentationException::notFound();
        }

        if (is_array($selectedVersion) && ($selectedVersion['status'] ?? null) === 'archived') {
            return $this->archivedVersionView($index, $selectedVersion, $localeCode);
        }

        $currentSlug = $this->indexBuilder->normalizeSlug($request['slug']);

        if ($currentSlug === '') {
            $currentSlug = (string) ($index['first_sidebar_slug'] ?? $index['first_slug'] ?? '');
        }

        $current = $currentSlug === '' ? null : ($index['pages'][$currentSlug] ?? null);
        if ($request['explicit_slug'] && $current === null) {
            throw DocumentationException::notFound();
        }

        if ($current === null) {
            return [
                'sidebars'       => $index['sidebars'],
                'active_sidebar' => $index['sidebars'][0] ?? null,
                'tree'           => $index['tree'],
                'current'        => null,
                'document'       => null,
                'breadcrumbs'    => [],
                'toc'            => [],
                'diagnostics'    => $index['diagnostics'],
                'search'         => $index['search_entries'],
                'versions'       => $index['versions'],
                'not_found'      => null,
                'prev'           => null,
                'next'           => null,
            ];
        }

        $activeSidebar = $this->navigation->activeSidebar($current, $index['sidebars']);
        $activeTree    = $index['tree'];
        $activePages   = $index['flat_pages'];

        $document   = $this->renderer->render($current, $index);
        $navigation = $this->navigation->prevNext($activePages, $currentSlug);

        return [
            'sidebars'       => $index['sidebars'],
            'active_sidebar' => $activeSidebar,
            'tree'           => $activeTree,
            'current'        => $current,
            'document'       => $document,
            'breadcrumbs'    => $this->navigation->breadcrumbs(
                $current,
                $index['categories'],
                (string) ($current['docs_url_prefix'] ?? '/docs'),
                ($current['locale'] ?? '') === 'en' ? 'Documentation' : 'Документация',
            ),
            'toc'         => $document['toc'],
            'diagnostics' => [...$index['diagnostics'], ...$document['diagnostics']],
            'search'      => $index['search_entries'],
            'versions'    => $index['versions'],
            'not_found'   => null,
            'prev'        => $navigation['prev'],
            'next'        => $navigation['next'],
        ];
    }

    /**
     * @return array{from:string,to:string,status:int,path:string}|null
     */
    public function redirectFor(?string $slugPath, ?string $localeCode = null): ?array
    {
        if ($slugPath === null) {
            return null;
        }

        $request = $this->versionedRequest($slugPath);
        if ($request['versions_index'] || $request['version'] !== null) {
            return null;
        }

        $index = $this->indexBuilder->build($localeCode);
        $slug  = $this->indexBuilder->normalizeSlug($request['slug']);
        if ($slug === '') {
            return null;
        }

        $redirect = $index['redirects'][$slug] ?? null;

        return is_array($redirect) ? $redirect : null;
    }

    /**
     * @param array<string,mixed> $current
     * @return list<array{locale:string,href:string}>
     */
    public function alternateLinks(array $current): array
    {
        return $this->indexBuilder->alternateLinks($current);
    }

    /**
     * @return array{
     *     sidebars:list<array<string,string>>,
     *     active_sidebar:array<string,string>|null,
     *     tree:list<array<string,mixed>>,
     *     current:null,
     *     document:null,
     *     breadcrumbs:list<array<string,string>>,
     *     toc:list<array<string,mixed>>,
     *     diagnostics:list<array<string,mixed>>,
     *     search:list<array<string,mixed>>,
     *     not_found:array{slug:string},
     *     prev:null,
     *     next:null
     * }
     */
    public function notFoundView(?string $slugPath, ?string $localeCode = null): array
    {
        $index = $this->indexBuilder->build($localeCode);
        $slug  = $this->indexBuilder->normalizeSlug($slugPath ?? '');

        $activeSidebar = $this->activeSidebarForSlug($slug, $index['sidebars']);
        $activeTree    = $index['tree'];

        return [
            'sidebars'       => $index['sidebars'],
            'active_sidebar' => $activeSidebar,
            'tree'           => $activeTree,
            'current'        => null,
            'document'       => null,
            'breadcrumbs'    => [
                ['title' => 'Документация', 'href' => (string) (($activeSidebar['href'] ?? null) ?: '/docs')],
                ['title' => 'Страница не найдена', 'href' => ''],
            ],
            'toc'         => [],
            'diagnostics' => $index['diagnostics'],
            'search'      => $index['search_entries'],
            'versions'    => $index['versions'],
            'not_found'   => ['slug' => $slug],
            'prev'        => null,
            'next'        => null,
        ];
    }

    /**
     * @return array{version:string|null,slug:string,explicit_slug:bool,versions_index:bool}
     */
    private function versionedRequest(?string $slugPath): array
    {
        $slug = $this->indexBuilder->normalizeSlug($slugPath ?? '');
        if ($slug === 'versions') {
            return [
                'version'        => null,
                'slug'           => '',
                'explicit_slug'  => true,
                'versions_index' => true,
            ];
        }

        if (preg_match('~^v/([^/]+)(?:/(.*))?$~', $slug, $matches) === 1) {
            return [
                'version'        => $matches[1],
                'slug'           => (string) ($matches[2] ?? ''),
                'explicit_slug'  => isset($matches[2]) && $matches[2] !== '',
                'versions_index' => false,
            ];
        }

        return [
            'version'        => null,
            'slug'           => $slug,
            'explicit_slug'  => $slugPath !== null && $slug !== '',
            'versions_index' => false,
        ];
    }

    /**
     * @param array<string,mixed> $index
     * @return array<string,mixed>
     */
    private function versionsIndexView(array $index, ?string $localeCode): array
    {
        $title = $localeCode === 'ru' ? 'Все версии' : 'All versions';
        $href  = (string) ($index['versions']['all_href'] ?? '/docs/versions');

        return [
            'sidebars'       => $index['sidebars'],
            'active_sidebar' => $index['sidebars'][0] ?? null,
            'tree'           => $index['tree'],
            'current'        => [
                'kind'        => 'versions-index',
                'type'        => 'versions-index',
                'title'       => $title,
                'label'       => $title,
                'href'        => $href,
                'slug'        => 'versions',
                'path'        => 'versions',
                'parent_path' => '',
                'description' => $localeCode === 'ru'
                    ? 'Список доступных и архивных версий документации.'
                    : 'Available and archived documentation versions.',
                'docs_url_prefix' => (string) (($index['versions']['items'][0]['href'] ?? null) ?: '/docs'),
                'locale'          => $localeCode ?? 'en',
            ],
            'document' => [
                'kind'        => 'versions-index',
                'items'       => $index['versions']['items'] ?? [],
                'html'        => '',
                'toc'         => [],
                'diagnostics' => [],
            ],
            'breadcrumbs' => [
                ['title' => $localeCode === 'ru' ? 'Документация' : 'Documentation', 'href' => (string) (($index['versions']['items'][0]['href'] ?? null) ?: '/docs')],
                ['title' => $title, 'href' => $href],
            ],
            'toc'         => [],
            'diagnostics' => $index['diagnostics'],
            'search'      => $index['search_entries'],
            'versions'    => $index['versions'],
            'not_found'   => null,
            'prev'        => null,
            'next'        => null,
        ];
    }

    /**
     * @param array<string,mixed> $index
     * @param array<string,mixed> $version
     * @return array<string,mixed>
     */
    private function archivedVersionView(array $index, array $version, ?string $localeCode): array
    {
        $versionLabel = (string) ($version['label'] ?? $version['version'] ?? '');
        $title        = $localeCode === 'ru'
            ? 'Версия ' . $versionLabel . ' в архиве'
            : 'Version ' . $versionLabel . ' is archived';
        $href = ($localeCode === 'ru' ? '/ru' : '') . '/docs/v/' . (string) ($version['version'] ?? '');

        return [
            'sidebars'       => [],
            'active_sidebar' => null,
            'tree'           => [],
            'current'        => [
                'kind'        => 'version-archive',
                'type'        => 'version-archive',
                'title'       => $title,
                'label'       => $title,
                'href'        => $href,
                'slug'        => '',
                'path'        => '',
                'parent_path' => '',
                'description' => $localeCode === 'ru'
                    ? 'Документация для этой версии больше не публикуется.'
                    : 'Documentation for this version is no longer published.',
                'locale' => $localeCode ?? 'en',
            ],
            'document' => [
                'kind'        => 'version-archive',
                'version'     => $version,
                'html'        => '',
                'toc'         => [],
                'diagnostics' => [],
            ],
            'breadcrumbs' => [
                ['title' => $localeCode === 'ru' ? 'Документация' : 'Documentation', 'href' => ($localeCode === 'ru' ? '/ru' : '') . '/docs'],
                ['title' => $title, 'href' => $href],
            ],
            'toc'         => [],
            'diagnostics' => $index['diagnostics'],
            'search'      => [],
            'versions'    => $index['versions'],
            'not_found'   => null,
            'prev'        => null,
            'next'        => null,
        ];
    }

    /**
     * @param list<array<string,string>> $sidebars
     * @return array<string,string>|null
     */
    private function activeSidebarForSlug(string $slug, array $sidebars): ?array
    {
        foreach ($sidebars as $sidebar) {
            $sidebarSlug = (string) ($sidebar['slug'] ?? '');
            if ($sidebarSlug !== '' && ($slug === $sidebarSlug || str_starts_with($slug, $sidebarSlug . '/'))) {
                return $sidebar;
            }
        }

        return $sidebars[0] ?? null;
    }
}
