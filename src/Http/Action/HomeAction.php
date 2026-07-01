<?php

declare(strict_types=1);

namespace App\Http\Action;

use App\Feature\Page\PageException;
use App\Feature\Page\Query\ReadPublicPage\ReadPublicPageHandler;
use App\Feature\Site\SeoMetaBuilder;
use App\Feature\Site\SiteLocaleResolver;
use PhpSoftBox\Inertia\Inertia;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

use function is_array;

final readonly class HomeAction
{
    public function __construct(
        private ResponseFactoryInterface $responses,
        private ReadPublicPageHandler $handler,
        private Inertia $inertia,
        private SeoMetaBuilder $seo,
        private SiteLocaleResolver $locales,
    ) {
    }

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $locale = $this->locales->fromRequest($request);
        if ($locale === null) {
            throw PageException::notFound();
        }

        if ($this->handler->hasHomePage($locale->code)) {
            $page       = $this->handler->handle(null, $locale->code);
            $title      = $page['current']['title'] ?? 'Главная';
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
                    ...$this->seo->links($request, $href, $alternates),
                ],
            ]);
        }

        return $this->responses
            ->createResponse(302)
            ->withHeader('Location', $locale->url('/docs'));
    }
}
