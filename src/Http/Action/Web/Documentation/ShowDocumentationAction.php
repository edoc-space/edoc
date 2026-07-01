<?php

declare(strict_types=1);

namespace App\Http\Action\Web\Documentation;

use App\Feature\Documentation\DocumentationException;
use App\Feature\Documentation\Query\ReadPublicDocumentation\ReadPublicDocumentationHandler;
use App\Feature\Site\SeoMetaBuilder;
use App\Feature\Site\SiteLocaleResolver;
use App\Http\Request\Web\Documentation\ShowDocumentationRequest;
use PhpSoftBox\Inertia\Inertia;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

use function is_array;

final readonly class ShowDocumentationAction
{
    public function __construct(
        private ReadPublicDocumentationHandler $handler,
        private Inertia $inertia,
        private ResponseFactoryInterface $responses,
        private SeoMetaBuilder $seo,
        private SiteLocaleResolver $locales,
    ) {
    }

    public function __invoke(ShowDocumentationRequest $request, ServerRequestInterface $psrRequest): ResponseInterface
    {
        $locale = $this->locales->resolve($request->localeCode());
        if ($locale === null) {
            throw DocumentationException::notFound();
        }

        $redirect = $this->handler->redirectFor($request->slugPath(), $locale->code);
        if ($redirect !== null) {
            return $this->responses
                ->createResponse($redirect['status'])
                ->withHeader('Location', $redirect['to']);
        }

        try {
            $documentation = $this->handler->handle($request->slugPath(), $locale->code);
        } catch (DocumentationException $exception) {
            if ($exception->statusCode() !== 404) {
                throw $exception;
            }

            $documentation = $this->handler->notFound($request->slugPath(), $locale->code);
            $notFoundTitle = $locale->code === 'en' ? 'Page not found' : 'Страница не найдена';

            return $this->inertia->render('Web/Documentation/Show', [
                'title'         => $notFoundTitle,
                'documentation' => $documentation,
                'meta'          => [
                    'title'       => $notFoundTitle,
                    'description' => $locale->code === 'en'
                        ? 'The requested documentation page was not found.'
                        : 'Запрошенная страница документации не найдена.',
                    'language' => $locale->code,
                    ...$this->seo->links($psrRequest, $locale->url('/docs')),
                ],
            ])->withStatus(404);
        }

        $title      = $documentation['current']['title'] ?? 'Документация';
        $href       = (string) ($documentation['current']['href'] ?? '/docs');
        $alternates = is_array($documentation['current'] ?? null)
            ? $this->handler->alternateLinks($documentation['current'])
            : [];

        return $this->inertia->render('Web/Documentation/Show', [
            'title'         => $title,
            'documentation' => $documentation,
                'meta'      => [
                    'title'       => $title,
                    'description' => $documentation['current']['description']
                        ?? ($locale->code === 'en' ? 'Project documentation.' : 'Документация проекта.'),
                    'language' => $locale->code,
                    ...$this->seo->links($psrRequest, $href, $alternates),
                ],
        ]);
    }
}
