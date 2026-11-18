<?php

declare(strict_types=1);

namespace App\Inertia;

use App\Feature\Blog\BlogRepository;
use App\Feature\Documentation\DocumentationRepository;
use App\Feature\Page\PageRepository;
use App\Feature\Site\SiteConfigRepository;
use App\Feature\Site\SiteLocaleResolver;
use PhpSoftBox\Inertia\Area\AreaSharedDataProviderInterface;
use Psr\Http\Message\ServerRequestInterface;

use function array_column;
use function in_array;

final readonly class WebSharedDataProvider implements AreaSharedDataProviderInterface
{
    public function __construct(
        private PageRepository $pages,
        private DocumentationRepository $documentation,
        private SiteConfigRepository $site,
        private SiteLocaleResolver $locales,
        private BlogRepository $blog,
    ) {
    }

    public function area(): string
    {
        return 'web';
    }

    public function share(ServerRequestInterface $request): array
    {
        $locale = $this->locales->fromRequest($request) ?? $this->locales->default();
        $site   = $this->site->sharedData(
            pages: $this->pages->navigation($locale->code),
            docs: $this->documentation->navigation($locale->code),
            locale: $locale,
        );

        $blogEnabled = $this->blog->config()['enabled'];
        // Themes may expose the locale feed on any page, independently of navigation.
        $site['footer']['feedUrl'] = $blogEnabled ? $locale->url('/blog/rss.xml') : null;

        if ($blogEnabled && !in_array($locale->url('/blog'), array_column($site['navigation'], 'href'), true)) {
            $site['navigation'][] = ['title' => $locale->code === 'ru' ? 'Блог' : 'Blog', 'href' => $locale->url('/blog')];
        }

        return [
            'web' => [
                'site'        => $site['site'],
                'locale'      => $site['locale'],
                'locales'     => $site['locales'],
                'ui'          => $site['ui'],
                'navigation'  => $site['navigation'],
                'footer'      => $site['footer'],
                'diagnostics' => $site['diagnostics'],
            ],
        ];
    }
}
