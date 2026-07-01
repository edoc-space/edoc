<?php

declare(strict_types=1);

namespace App\Http\Action\Web\Page;

use App\Feature\Page\PageException;
use App\Feature\Page\Query\ReadPublicPage\ReadPublicPageHandler;
use App\Feature\Site\SeoMetaBuilder;
use App\Feature\Site\SiteLocaleResolver;
use App\Http\Request\Web\Page\ShowPageRequest;
use PhpSoftBox\Inertia\Inertia;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

use function is_array;

final readonly class ShowPageAction
{
    public function __construct(
        private ReadPublicPageHandler $handler,
        private Inertia $inertia,
        private SeoMetaBuilder $seo,
        private SiteLocaleResolver $locales,
    ) {
    }

    public function __invoke(ShowPageRequest $request, ServerRequestInterface $psrRequest): ResponseInterface
    {
        $locale = $this->locales->resolve($request->localeCode());
        if ($locale === null) {
            throw PageException::notFound();
        }

        $page       = $this->handler->handle($request->slugPath(), $locale->code);
        $title      = $page['current']['title'] ?? 'Страница';
        $href       = (string) ($page['current']['href'] ?? '/');
        $alternates = is_array($page['current'] ?? null)
            ? $this->handler->alternateLinks($page['current'])
            : [];

        return $this->inertia->render('Web/Page/Show', [
            'title' => $title,
            'page'  => $page,
            'meta'  => [
                'title'       => $title,
                'description' => $page['current']['description'] ?? null,
                'language'    => $locale->code,
                ...$this->seo->links($psrRequest, $href, $alternates),
            ],
        ]);
    }
}
