<?php

declare(strict_types=1);

namespace App\Feature\Site;

use JsonException;
use PhpSoftBox\Storage\Storage;

use function array_is_list;
use function array_key_exists;
use function array_values;
use function is_array;
use function is_bool;
use function is_string;
use function json_decode;
use function ltrim;
use function str_contains;
use function str_replace;
use function str_starts_with;
use function trim;

use const JSON_THROW_ON_ERROR;

final readonly class SiteConfigRepository
{
    private const string CONFIG_PATH = 'site.json';

    private SiteLocaleResolver $locales;

    public function __construct(
        private Storage $storage,
        ?SiteLocaleResolver $locales = null,
    ) {
        $this->locales = $locales ?? new SiteLocaleResolver($this->storage);
    }

    /**
     * @param list<array<string,mixed>> $pages
     * @param list<array<string,mixed>> $docs
     * @return array{
     *     site:array<string,mixed>,
     *     locale:array<string,mixed>,
     *     locales:list<array<string,mixed>>,
     *     ui:array<string,string>,
     *     navigation:list<array<string,mixed>>,
     *     footer:array<string,mixed>,
     *     diagnostics:list<array<string,mixed>>
     * }
     */
    public function sharedData(array $pages, array $docs, ?SiteLocale $locale = null): array
    {
        $locale ??= $this->locales->default();
        $diagnostics = [];
        $config      = $this->readConfigForLocale($locale, $diagnostics);
        $ui          = $this->ui($config, $locale);
        $sources     = [
            'pages' => $this->sourceItems($pages, 'pages', $ui['site'], $locale),
            'docs'  => $this->sourceItems($docs, 'docs', $ui['documentation'], $locale),
        ];

        return [
            'site'        => $this->site($config, $diagnostics, $locale),
            'locale'      => $this->localeItem($locale, true),
            'locales'     => $this->localeItems($locale),
            'ui'          => $ui,
            'navigation'  => $this->navigation($config, $sources, $diagnostics, $locale),
            'footer'      => $this->footer($config, $sources, $diagnostics, $locale, $ui),
            'diagnostics' => $diagnostics,
        ];
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     * @return array<string,mixed>
     */
    private function readConfigForLocale(SiteLocale $locale, array &$diagnostics): array
    {
        $config = $this->readConfig(self::CONFIG_PATH, $diagnostics);
        if ($locale->contentPrefix === '') {
            return $config;
        }

        $localizedPath = $locale->contentPath('', self::CONFIG_PATH);
        $localized     = $this->readConfig($localizedPath, $diagnostics);
        if ($localized === []) {
            return $config;
        }

        return $this->mergeConfig($config, $localized);
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     * @return array<string,mixed>
     */
    private function readConfig(string $path, array &$diagnostics): array
    {
        $storage = $this->storage->disk(SiteStorage::SITE_DISK);
        if ($storage->missing($path)) {
            return [];
        }

        try {
            $config = json_decode($storage->read($path), true, 512, JSON_THROW_ON_ERROR);
            if (is_array($config)) {
                return $config;
            }
        } catch (JsonException $exception) {
            $diagnostics[] = [
                'level'   => 'error',
                'code'    => 'site.invalid_json',
                'message' => $exception->getMessage(),
                'path'    => $path,
                'line'    => null,
            ];
        }

        return [];
    }

    /**
     * @param array<string,mixed> $config
     * @return array<string,mixed>
     */
    private function site(array $config, array &$diagnostics, SiteLocale $locale): array
    {
        $brand     = is_array($config['brand'] ?? null) ? $config['brand'] : [];
        $brandData = [
            'name' => $this->stringValue($brand['name'] ?? '') ?: 'e-doc',
            'href' => $this->localizedHref($this->stringValue($brand['href'] ?? '') ?: '/', $locale),
        ];

        $logo = $this->logo($brand['logo'] ?? null, $diagnostics);
        if ($logo !== null) {
            $brandData['logo'] = $logo;
        }

        return [
            'title'       => $this->stringValue($config['title'] ?? '') ?: 'E-Doc',
            'description' => $this->stringValue($config['description'] ?? '') ?: 'Self-hosted documentation hosting на Markdown-файлах.',
            'brand'       => $brandData,
            'links'       => $this->links($config),
        ];
    }

    /**
     * @param array<string,mixed> $config
     * @return array<string,string>
     */
    private function links(array $config): array
    {
        $links  = is_array($config['links'] ?? null) ? $config['links'] : [];
        $github = $this->stringValue($links['github'] ?? $config['github'] ?? '');

        return $github === '' ? [] : ['github' => $github];
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     * @return array{src:string,alt:string}|null
     */
    private function logo(mixed $value, array &$diagnostics): ?array
    {
        if (is_array($value)) {
            $src = $this->stringValue($value['src'] ?? $value['path'] ?? '');
            $alt = $this->stringValue($value['alt'] ?? '');
        } else {
            $src = $this->stringValue($value);
            $alt = '';
        }

        if ($src === '') {
            return null;
        }

        return [
            'src' => $this->assetUrl($src, $diagnostics),
            'alt' => $alt,
        ];
    }

    /**
     * @param list<array<string,mixed>> $diagnostics
     */
    private function assetUrl(string $src, array &$diagnostics): string
    {
        if ($this->isPublicUrl($src)) {
            return $src;
        }

        $path = ltrim(str_replace('\\', '/', $src), '/');
        if ($path === '' || str_starts_with($path, '../') || str_contains($path, '/../')) {
            $diagnostics[] = $this->diagnostic('warning', 'site.logo_invalid', 'Brand logo path must stay inside static storage.', 'site.json');

            return $src;
        }

        $static = $this->storage->disk(SiteStorage::STATIC_DISK);
        if ($static->missing($path)) {
            $diagnostics[] = $this->diagnostic('warning', 'site.logo_missing', 'Brand logo file does not exist: ' . $path, 'site.json');
        }

        return $static->url($path);
    }

    private function isPublicUrl(string $src): bool
    {
        return str_starts_with($src, '/')
            || str_starts_with($src, 'http://')
            || str_starts_with($src, 'https://')
            || str_starts_with($src, '//')
            || str_starts_with($src, 'data:');
    }

    /**
     * @param array<string,mixed> $config
     * @param array<string,list<array<string,mixed>>> $sources
     * @param list<array<string,mixed>> $diagnostics
     * @return list<array<string,mixed>>
     */
    private function navigation(array $config, array $sources, array &$diagnostics, SiteLocale $locale): array
    {
        $navigation = $config['navigation'] ?? null;
        if (!is_array($navigation)) {
            return [
                ...$sources['pages'],
                ...$sources['docs'],
            ];
        }

        return $this->expandItems($navigation, $sources, 'navigation', $diagnostics, $locale);
    }

    /**
     * @param array<string,mixed> $config
     * @param array<string,list<array<string,mixed>>> $sources
     * @param list<array<string,mixed>> $diagnostics
     * @return array<string,mixed>
     */
    private function footer(array $config, array $sources, array &$diagnostics, SiteLocale $locale, array $ui): array
    {
        $footer  = is_array($config['footer'] ?? null) ? $config['footer'] : [];
        $columns = is_array($footer['columns'] ?? null)
            ? $this->footerColumns($footer['columns'], $sources, $diagnostics, $locale)
            : $this->defaultFooterColumns($sources, $ui);

        return [
            'enabled'     => $this->boolValue($footer['enabled'] ?? true),
            'description' => $this->stringValue($footer['description'] ?? ''),
            'columns'     => $columns,
            'copyright'   => $this->stringValue($footer['copyright'] ?? ''),
        ];
    }

    /**
     * @param list<array<string,mixed>> $columns
     * @param array<string,list<array<string,mixed>>> $sources
     * @param list<array<string,mixed>> $diagnostics
     * @return list<array{title:string,items:list<array<string,mixed>>}>
     */
    private function footerColumns(array $columns, array $sources, array &$diagnostics, SiteLocale $locale): array
    {
        $result = [];

        foreach (array_values($columns) as $index => $column) {
            if (!is_array($column)) {
                $diagnostics[] = $this->diagnostic('warning', 'site.footer_column_invalid', 'Footer column must be an object.', 'site.json');
                continue;
            }

            $title = $this->stringValue($column['title'] ?? '') ?: 'Раздел';
            $items = is_array($column['items'] ?? null) ? array_values($column['items']) : [];
            if (
                $this->stringValue($column['source'] ?? '') !== ''
                || $this->stringValue($column['href'] ?? '') !== ''
                || $items === []
            ) {
                $items = [$column, ...$items];
            }

            $items = $this->expandItems(
                $items,
                $sources,
                'footer.columns.' . $index,
                $diagnostics,
                $locale,
                $title,
            );

            if ($items === []) {
                continue;
            }

            $result[] = [
                'title' => $title,
                'items' => $items,
            ];
        }

        return $result;
    }

    /**
     * @param array<string,list<array<string,mixed>>> $sources
     * @return list<array{title:string,items:list<array<string,mixed>>}>
     */
    private function defaultFooterColumns(array $sources, array $ui): array
    {
        return array_values(array_filter([
            ['title' => $ui['site'], 'items' => $sources['pages']],
            ['title' => $ui['documentation'], 'items' => $sources['docs']],
        ], static fn (array $column): bool => $column['items'] !== []));
    }

    /**
     * @param list<array<string,mixed>> $items
     * @param array<string,list<array<string,mixed>>> $sources
     * @param list<array<string,mixed>> $diagnostics
     * @return list<array<string,mixed>>
     */
    private function expandItems(
        array $items,
        array $sources,
        string $context,
        array &$diagnostics,
        SiteLocale $locale,
        ?string $footerColumn = null,
    ): array {
        $expanded = [];

        foreach (array_values($items) as $index => $item) {
            if (!is_array($item)) {
                $diagnostics[] = $this->diagnostic('warning', 'site.item_invalid', $context . ' item must be an object.', 'site.json');
                continue;
            }

            if ($this->boolValue($item['hidden'] ?? false)) {
                continue;
            }

            $source = $this->stringValue($item['source'] ?? '');
            if ($source !== '') {
                if (!array_key_exists($source, $sources)) {
                    $diagnostics[] = $this->diagnostic('warning', 'site.source_unknown', 'Unknown navigation source: ' . $source, 'site.json');
                    continue;
                }

                foreach ($sources[$source] as $sourceItem) {
                    $expanded[] = $footerColumn === null
                        ? $sourceItem
                        : [...$sourceItem, 'footer_column' => $footerColumn];
                }

                continue;
            }

            $link = $this->linkItem($item, $footerColumn, $locale);
            if ($link === null) {
                $diagnostics[] = $this->diagnostic(
                    'warning',
                    'site.link_invalid',
                    $context . '.' . $index . ' link must define href and label or title.',
                    'site.json',
                );
                continue;
            }

            $expanded[] = $link;
        }

        return $expanded;
    }

    /**
     * @param list<array<string,mixed>> $items
     * @return list<array<string,mixed>>
     */
    private function sourceItems(array $items, string $source, string $footerColumn, SiteLocale $locale): array
    {
        $result = [];

        foreach ($items as $item) {
            $link = $this->linkItem($item, $footerColumn, $locale);
            if ($link === null) {
                continue;
            }

            $result[] = [
                ...$item,
                ...$link,
                'source'        => $source,
                'footer_column' => $footerColumn,
            ];
        }

        return $result;
    }

    /**
     * @param array<string,mixed> $item
     * @return array<string,mixed>|null
     */
    private function linkItem(array $item, ?string $footerColumn, SiteLocale $locale): ?array
    {
        $href  = $this->stringValue($item['href'] ?? '');
        $title = $this->stringValue($item['title'] ?? '');
        $label = $this->stringValue($item['label'] ?? '') ?: $title;

        if ($href === '' || $label === '') {
            return null;
        }

        $link = [
            'title' => $title ?: $label,
            'label' => $label,
            'href'  => $this->localizedHref($href, $locale),
        ];

        $description = $this->stringValue($item['description'] ?? '');
        if ($description !== '') {
            $link['description'] = $description;
        }

        if ($footerColumn !== null) {
            $link['footer_column'] = $footerColumn;
        }

        return $link;
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function localeItems(SiteLocale $current): array
    {
        $items = [];
        foreach ($this->locales->all() as $locale) {
            $items[] = $this->localeItem($locale, $locale->code === $current->code);
        }

        return $items;
    }

    /**
     * @return array<string,mixed>
     */
    private function localeItem(SiteLocale $locale, bool $current): array
    {
        return [
            'code'       => $locale->code,
            'label'      => $locale->label,
            'href'       => $locale->url('/'),
            'url_prefix' => $locale->urlPrefix,
            'default'    => $locale->default,
            'current'    => $current,
        ];
    }

    private function localizedHref(string $href, SiteLocale $locale): string
    {
        if ($href === '' || $locale->urlPrefix === '' || !str_starts_with($href, '/') || $this->isExternalUrl($href)) {
            return $href;
        }

        return $locale->url($href);
    }

    private function isExternalUrl(string $href): bool
    {
        return str_starts_with($href, 'http://')
            || str_starts_with($href, 'https://')
            || str_starts_with($href, '//')
            || str_starts_with($href, 'mailto:')
            || str_starts_with($href, 'tel:')
            || str_starts_with($href, '#');
    }

    /**
     * @return array{level:string,code:string,message:string,path:string,line:null}
     */
    private function diagnostic(string $level, string $code, string $message, string $path): array
    {
        return [
            'level'   => $level,
            'code'    => $code,
            'message' => $message,
            'path'    => $path,
            'line'    => null,
        ];
    }

    private function stringValue(mixed $value): string
    {
        return is_string($value) ? trim($value) : '';
    }

    private function boolValue(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            return match (trim($value)) {
                '1', 'true', 'yes', 'on'  => true,
                '0', 'false', 'no', 'off' => false,
                default                   => false,
            };
        }

        return (bool) $value;
    }

    /**
     * @param array<string,mixed> $base
     * @param array<string,mixed> $override
     * @return array<string,mixed>
     */
    private function mergeConfig(array $base, array $override): array
    {
        foreach ($override as $key => $value) {
            if (
                is_array($value)
                && isset($base[$key])
                && is_array($base[$key])
                && !array_is_list($value)
                && !array_is_list($base[$key])
            ) {
                $base[$key] = $this->mergeConfig($base[$key], $value);
                continue;
            }

            $base[$key] = $value;
        }

        return $base;
    }

    /**
     * @param array<string,mixed> $config
     * @return array<string,string>
     */
    private function ui(array $config, SiteLocale $locale): array
    {
        $ui       = $this->defaultUi($locale);
        $override = is_array($config['ui'] ?? null) ? $config['ui'] : [];

        foreach ($override as $key => $value) {
            if (!is_string($key) || !is_string($value) || trim($value) === '') {
                continue;
            }

            $ui[$key] = trim($value);
        }

        return $ui;
    }

    /**
     * @return array<string,string>
     */
    private function defaultUi(SiteLocale $locale): array
    {
        if ($locale->code === 'en') {
            return [
                'site'                       => 'Site',
                'documentation'              => 'Documentation',
                'section'                    => 'Section',
                'headerAria'                 => 'Top navigation',
                'primaryNavigationAria'      => 'Primary navigation',
                'footerNavigationAria'       => 'Footer navigation',
                'languageSwitcherAria'       => 'Language',
                'breadcrumbsAria'            => 'Breadcrumbs',
                'documentationNavAria'       => 'Documentation navigation',
                'closeMenu'                  => 'Close menu',
                'openMenu'                   => 'Open menu',
                'tocAria'                    => 'Page contents',
                'tocTitle'                   => 'Contents',
                'searchPlaceholder'          => 'Search',
                'searchAria'                 => 'Search documentation',
                'searchOpenAria'             => 'Open search',
                'searchClose'                => 'Close search',
                'searchStart'                => 'Start typing to search documentation.',
                'searchEmpty'                => 'No results',
                'githubAria'                 => 'Open GitHub repository',
                'versionsLabel'              => 'Documentation version',
                'version'                    => 'Version',
                'allVersions'                => 'All versions',
                'currentVersion'             => 'Current',
                'supportedVersion'           => 'Supported',
                'archivedVersion'            => 'Archived',
                'archivedVersionDescription' => 'Documentation for this version is no longer published and is excluded from search.',
                'openCurrentVersion'         => 'Open current version',
                'status'                     => 'Status',
                'category'                   => 'Section',
                'document'                   => 'Document',
                'sectionContentsAria'        => 'Section contents',
                'sectionEmpty'               => 'This section has no documents yet.',
                'collapseSidebarAria'        => 'Collapse sidebar',
                'expandSidebarAria'          => 'Expand sidebar',
                'collapseSidebar'            => 'Collapse',
                'expandSidebar'              => 'Expand',
                'collapseSectionAria'        => 'Collapse section',
                'expandSectionAria'          => 'Expand section',
                'pagerAria'                  => 'Page navigation',
                'previousPage'               => 'Back',
                'nextPage'                   => 'Next',
                'notFoundTitle'              => 'Page not found',
                'notFoundDescription'        => 'The requested documentation path was not found in the current documentation tree.',
                'goToDocumentation'          => 'Go to documentation',
                'popularPagesAria'           => 'Popular pages',
                'emptyDocumentationTitle'    => 'Documentation is not published yet',
                'emptyDocumentationText'     => 'Add Markdown files to the current locale docs directory and refresh the page.',
                'footerPoweredBy'            => 'Built with',
            ];
        }

        return [
            'site'                       => 'Сайт',
            'documentation'              => 'Документация',
            'section'                    => 'Раздел',
            'headerAria'                 => 'Верхнее меню',
            'primaryNavigationAria'      => 'Основная навигация',
            'footerNavigationAria'       => 'Навигация в подвале',
            'languageSwitcherAria'       => 'Выбор языка',
            'breadcrumbsAria'            => 'Хлебные крошки',
            'documentationNavAria'       => 'Навигация документации',
            'closeMenu'                  => 'Закрыть меню',
            'openMenu'                   => 'Открыть меню',
            'tocAria'                    => 'Оглавление страницы',
            'tocTitle'                   => 'Оглавление',
            'searchPlaceholder'          => 'Поиск',
            'searchAria'                 => 'Поиск по документации',
            'searchOpenAria'             => 'Открыть поиск',
            'searchClose'                => 'Закрыть поиск',
            'searchStart'                => 'Начните вводить запрос для поиска по документации.',
            'searchEmpty'                => 'Ничего не найдено',
            'githubAria'                 => 'Открыть репозиторий GitHub',
            'versionsLabel'              => 'Версия документации',
            'version'                    => 'Версия',
            'allVersions'                => 'Все версии',
            'currentVersion'             => 'Текущая',
            'supportedVersion'           => 'Поддерживается',
            'archivedVersion'            => 'Архивная',
            'archivedVersionDescription' => 'Документация для этой версии больше не публикуется и не участвует в поиске.',
            'openCurrentVersion'         => 'Открыть текущую версию',
            'status'                     => 'Статус',
            'category'                   => 'Раздел',
            'document'                   => 'Документ',
            'sectionContentsAria'        => 'Содержание раздела',
            'sectionEmpty'               => 'В этом разделе пока нет документов.',
            'collapseSidebarAria'        => 'Свернуть сайдбар',
            'expandSidebarAria'          => 'Развернуть сайдбар',
            'collapseSidebar'            => 'Свернуть',
            'expandSidebar'              => 'Развернуть',
            'collapseSectionAria'        => 'Свернуть раздел',
            'expandSectionAria'          => 'Развернуть раздел',
            'pagerAria'                  => 'Навигация между страницами',
            'previousPage'               => 'Назад',
            'nextPage'                   => 'Дальше',
            'notFoundTitle'              => 'Страница не найдена',
            'notFoundDescription'        => 'Запрошенный путь не найден в текущей структуре документации.',
            'goToDocumentation'          => 'Перейти к документации',
            'popularPagesAria'           => 'Популярные страницы',
            'emptyDocumentationTitle'    => 'Документация пока не опубликована',
            'emptyDocumentationText'     => 'Добавьте Markdown-файлы в папку docs текущего языка и обновите страницу.',
            'footerPoweredBy'            => 'Создано на базе',
        ];
    }
}
