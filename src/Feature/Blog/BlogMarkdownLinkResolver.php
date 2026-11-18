<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use App\Feature\Site\SiteLocale;
use Closure;
use PhpSoftBox\Markdown\Contracts\MarkdownLinkResolverInterface;
use PhpSoftBox\Markdown\MarkdownRenderContext;
use PhpSoftBox\Markdown\MarkdownResolvedAsset;
use PhpSoftBox\Markdown\MarkdownResolvedLink;

use function array_pad;
use function array_pop;
use function dirname;
use function explode;
use function implode;
use function ltrim;
use function preg_match;
use function preg_replace;
use function preg_replace_callback;
use function rawurlencode;
use function str_contains;
use function str_starts_with;
use function strlen;
use function substr;

final readonly class BlogMarkdownLinkResolver implements MarkdownLinkResolverInterface
{
    /** @param array<string,string> $articleLinks @param array<string,string> $assets */
    public function __construct(
        private SiteLocale $locale,
        private string $source,
        private array $articleLinks,
        private array $assets,
        private ?Closure $prepareAsset = null,
    ) {
    }

    public function resolveLink(string $target, MarkdownRenderContext $context): MarkdownResolvedLink
    {
        return MarkdownResolvedLink::resolved($this->resolveTarget($target));
    }

    public function resolveAsset(string $target, MarkdownRenderContext $context): MarkdownResolvedAsset
    {
        return MarkdownResolvedAsset::resolved($this->resolveTarget($target));
    }

    public function resolveTarget(string $target): string
    {
        if (preg_match('~^(?:https?://|mailto:)~i', $target)) {
            return $target;
        }
        [$path, $fragment] = array_pad(explode('#', $target, 2), 2, null);
        $suffix            = $fragment === null ? '' : '#' . $this->fragment($fragment);
        if ($path === '') {
            return $suffix;
        }
        if (preg_match('~^[a-z][a-z0-9+.-]*:|^//~i', $path) || str_contains($path, '\\') || str_contains($path, '%')) {
            throw new BlogException('blog.link: unsafe link');
        }
        if (str_starts_with($path, '/storage/edoc/static/')) {
            if (!BlogFiles::relative(substr($path, strlen('/storage/edoc/static/')))) {
                throw new BlogException('blog.link: unsafe static path');
            }

            return $path . $suffix;
        }
        if (str_starts_with($path, '/')) {
            if (!BlogFiles::relative(ltrim($path, '/'))) {
                throw new BlogException('blog.link: unsafe path');
            }

            return $this->locale->url($path) . $suffix;
        }
        $parts = explode('/', dirname($this->source) . '/' . $path);
        $clean = [];
        foreach ($parts as $part) {
            if ($part === '.') {
                continue;
            }
            if ($part === '..') {
                if ($clean === []) {
                    throw new BlogException('blog.link: traversal');
                }
                array_pop($clean);
            } else {
                $clean[] = $part;
            }
        }
        $relative = implode('/', $clean);
        if (isset($this->articleLinks[$relative])) {
            return $this->articleLinks[$relative] . $suffix;
        }
        if (isset($this->assets[$path])) {
            return $this->assets[$path] . $suffix;
        }
        $prefix = $this->locale->contentPrefix . '/';
        foreach (['pages' => '', 'docs' => 'docs/'] as $section => $url) {
            if (str_starts_with($relative, $prefix . $section . '/')) {
                $slug = preg_replace('~(?:/index)?\.mdx?$~D', '', substr($relative, strlen($prefix . $section . '/')));

                return $this->locale->url('/' . $url . ($slug === 'index' ? '' : $slug)) . $suffix;
            }
        }
        if ($this->prepareAsset !== null) {
            return ($this->prepareAsset)($path, $relative) . $suffix;
        }

        throw new BlogException('blog.link: unresolved link or attachment');
    }
    private function fragment(string $fragment): string
    {
        if (preg_match('/%(?![0-9a-f]{2})/i', $fragment)) {
            throw new BlogException('blog.link: invalid fragment encoding');
        }
        $encoded = preg_replace_callback(
            '~[^a-z0-9\-._!$&\'()*+,;=:@/?%\x7E]~iu',
            static fn (array $match): string => rawurlencode($match[0]),
            $fragment,
        );
        if ($encoded === null) {
            throw new BlogException('blog.link: invalid fragment');
        }

        return $encoded;
    }

}
