<?php

declare(strict_types=1);

namespace App\Feature\Documentation;

use PhpSoftBox\Markdown\Contracts\MarkdownLinkResolverInterface;
use PhpSoftBox\Markdown\MarkdownDiagnostic;
use PhpSoftBox\Markdown\MarkdownDiagnosticLevel;
use PhpSoftBox\Markdown\MarkdownRenderContext;
use PhpSoftBox\Markdown\MarkdownResolvedAsset;
use PhpSoftBox\Markdown\MarkdownResolvedLink;
use PhpSoftBox\Storage\Storage;

use function array_pop;
use function dirname;
use function explode;
use function implode;
use function is_string;
use function ltrim;
use function parse_url;
use function preg_match;
use function preg_replace;
use function rawurlencode;
use function rtrim;
use function str_contains;
use function str_ends_with;
use function str_starts_with;
use function strlen;
use function substr;
use function trim;

use const PHP_URL_FRAGMENT;
use const PHP_URL_PATH;

final readonly class DocsMarkdownLinkResolver implements MarkdownLinkResolverInterface
{
    /**
     * @param array<string,array<string,mixed>> $documentsByPath
     * @param array<string,array<string,mixed>> $pagesBySlug
     */
    public function __construct(
        private array $documentsByPath,
        private array $pagesBySlug,
        private Storage $storage,
        private string $staticDisk,
        private string $staticPrefix = '',
        private string $docsUrlPrefix = '/docs',
    ) {
    }

    public function resolveLink(string $target, MarkdownRenderContext $context): MarkdownResolvedLink
    {
        $target = trim($target);
        if ($target === '' || str_starts_with($target, '#') || $this->isExternal($target)) {
            return MarkdownResolvedLink::resolved($target);
        }

        $fragment = parse_url($target, PHP_URL_FRAGMENT);
        $path     = parse_url($target, PHP_URL_PATH);
        $path     = is_string($path) ? $path : $target;

        if (str_starts_with($path, '/docs/')) {
            $slug = trim((string) preg_replace('~^/docs/?~', '', $path), '/');

            return isset($this->pagesBySlug[$slug])
                ? MarkdownResolvedLink::resolved($this->withFragment($this->docsHref($slug), $fragment))
                : $this->unresolvedLink($target);
        }

        if (str_starts_with($path, '/')) {
            return MarkdownResolvedLink::resolved($this->withFragment($path, $fragment));
        }

        $resolvedPath = $this->resolveRelativePath($path, (string) $context->currentDocumentPath());
        if ($resolvedPath === null) {
            return $this->unresolvedLink($target);
        }

        if (!$this->isDocumentPath($resolvedPath)) {
            $slug = trim($resolvedPath, '/');

            return isset($this->pagesBySlug[$slug])
                ? MarkdownResolvedLink::resolved($this->withFragment($this->docsHref($slug), $fragment))
                : MarkdownResolvedLink::resolved($this->withFragment($target, $fragment));
        }

        if (!isset($this->documentsByPath[$resolvedPath])) {
            return $this->unresolvedLink($target);
        }

        return MarkdownResolvedLink::resolved($this->withFragment(
            (string) $this->documentsByPath[$resolvedPath]['href'],
            $fragment,
        ));
    }

    public function resolveAsset(string $target, MarkdownRenderContext $context): MarkdownResolvedAsset
    {
        $target = trim($target);
        if ($target === '' || $this->isExternal($target)) {
            return MarkdownResolvedAsset::resolved($target);
        }

        $path = parse_url($target, PHP_URL_PATH);
        $path = is_string($path) ? $path : $target;

        $staticPath = str_starts_with($path, '/')
            ? ltrim($path, '/')
            : $this->resolveRelativePath($path, (string) $context->currentDocumentPath());

        $staticPath = $staticPath === null ? null : $this->normalizeStaticPath($staticPath);

        if ($staticPath === null || !$this->storage->disk($this->staticDisk)->exists($staticPath)) {
            return MarkdownResolvedAsset::unresolved($target, [
                new MarkdownDiagnostic(
                    MarkdownDiagnosticLevel::Warning,
                    'asset.unresolved',
                    'Asset not found: ' . $target,
                ),
            ]);
        }

        return MarkdownResolvedAsset::resolved($this->storage->url($staticPath, $this->staticDisk));
    }

    private function isExternal(string $target): bool
    {
        return preg_match('~^[a-z][a-z0-9+.-]*:~i', $target) === 1 || str_starts_with($target, '//');
    }

    private function withFragment(string $url, mixed $fragment): string
    {
        if (!is_string($fragment) || $fragment === '') {
            return $url;
        }

        return $url . '#' . rawurlencode($fragment);
    }

    private function unresolvedLink(string $target): MarkdownResolvedLink
    {
        return MarkdownResolvedLink::unresolved($target, [
            new MarkdownDiagnostic(
                MarkdownDiagnosticLevel::Warning,
                'link.unresolved',
                'Link not found: ' . $target,
            ),
        ]);
    }

    private function resolveRelativePath(string $path, string $currentDocumentPath): ?string
    {
        $base = dirname($currentDocumentPath);
        if ($base === '.') {
            $base = '';
        }

        $candidate = trim($base . '/' . $path, '/');
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

        $resolved = implode('/', $segments);

        return $resolved === '' || str_contains($resolved, "\0") ? null : $resolved;
    }

    private function isDocumentPath(string $path): bool
    {
        return str_ends_with($path, '.md') || str_ends_with($path, '.mdx');
    }

    private function docsHref(string $slug): string
    {
        $prefix = rtrim($this->docsUrlPrefix, '/');

        return $prefix . ($slug === '' ? '' : '/' . trim($slug, '/'));
    }

    private function prefixStaticPath(string $path): string
    {
        $path   = trim($path, '/');
        $prefix = trim($this->staticPrefix, '/');

        if ($prefix === '' || str_starts_with($path, $prefix . '/')) {
            return $path;
        }

        return $prefix . '/' . $path;
    }

    private function normalizeStaticPath(string $path): string
    {
        $path   = trim($path, '/');
        $prefix = trim($this->staticPrefix, '/');

        if ($prefix !== '') {
            $publicPrefix = 'storage/edoc/' . $prefix;
            if ($path === $publicPrefix || str_starts_with($path, $publicPrefix . '/')) {
                return substr($path, strlen('storage/edoc/'));
            }
        }

        return $this->prefixStaticPath($path);
    }
}
