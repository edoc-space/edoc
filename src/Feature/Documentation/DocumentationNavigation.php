<?php

declare(strict_types=1);

namespace App\Feature\Documentation;

use function array_reverse;
use function is_array;
use function str_starts_with;

final readonly class DocumentationNavigation
{
    /**
     * @param array<string,mixed> $current
     * @param list<array<string,string>> $sidebars
     * @return array<string,string>|null
     */
    public function activeSidebar(array $current, array $sidebars): ?array
    {
        $path = (string) ($current['path'] ?? '');
        foreach ($sidebars as $sidebar) {
            $sidebarPath = $sidebar['path'];
            if ($path === $sidebarPath || str_starts_with($path, $sidebarPath . '/')) {
                return $sidebar;
            }
        }

        return $sidebars[0] ?? null;
    }

    /**
     * @param list<array<string,mixed>> $tree
     * @param array<string,string> $activeSidebar
     * @return list<array<string,mixed>>
     */
    public function sidebarTree(array $tree, array $activeSidebar): array
    {
        foreach ($tree as $node) {
            if ((string) ($node['path'] ?? '') !== $activeSidebar['path']) {
                continue;
            }

            return [$node];
        }

        return $tree;
    }

    /**
     * @param list<array<string,mixed>> $nodes
     * @param array<string,array<string,mixed>> $pages
     * @return list<array<string,mixed>>
     */
    public function flatPages(array $nodes, array $pages): array
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
     * @return array{prev:array<string,string>|null,next:array<string,string>|null}
     */
    public function prevNext(array $pages, string $slug): array
    {
        foreach ($pages as $index => $page) {
            if (($page['slug'] ?? null) !== $slug) {
                continue;
            }

            return [
                'prev' => isset($pages[$index - 1]) ? $this->navItem($pages[$index - 1]) : null,
                'next' => isset($pages[$index + 1]) ? $this->navItem($pages[$index + 1]) : null,
            ];
        }

        return ['prev' => null, 'next' => null];
    }

    /**
     * @param array<string,mixed> $current
     * @param array<string,array<string,mixed>> $categories
     * @return list<array<string,string>>
     */
    public function breadcrumbs(array $current, array $categories, string $docsRootHref = '/docs', string $docsRootTitle = 'Документация'): array
    {
        $items = [
            ['title' => $docsRootTitle, 'href' => $docsRootHref],
        ];

        $parent = (string) ($current['parent_path'] ?? '');
        $stack  = [];
        while ($parent !== '') {
            if (!isset($categories[$parent])) {
                break;
            }
            $stack[] = $categories[$parent];
            $parent  = (string) ($categories[$parent]['parent_path'] ?? '');
        }

        foreach (array_reverse($stack) as $category) {
            if (($category['href'] ?? null) === null) {
                continue;
            }
            $items[] = $this->breadcrumbItem($category);
        }

        $items[] = $this->breadcrumbItem($current);

        return $items;
    }

    /**
     * @param array<string,mixed> $page
     * @return array{title:string,href:string}
     */
    private function navItem(array $page): array
    {
        return [
            'title' => (string) ($page['title'] ?? $page['label'] ?? ''),
            'href'  => (string) ($page['href'] ?? ''),
        ];
    }

    /**
     * @param array<string,mixed> $node
     * @return array{title:string,href:string}
     */
    private function breadcrumbItem(array $node): array
    {
        return [
            'title' => (string) ($node['title'] ?? $node['label'] ?? ''),
            'href'  => (string) ($node['href'] ?? ''),
        ];
    }
}
