<?php

declare(strict_types=1);

namespace App\Http\Action\Web\Documentation;

use App\Feature\Documentation\DocumentationException;
use App\Feature\Documentation\Query\ReadPublicDocumentation\ReadPublicDocumentationHandler;
use App\Feature\Site\SiteLocaleResolver;
use App\Support\JsonResponder;
use PhpSoftBox\Application\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface;

use function is_array;
use function is_string;
use function trim;

final readonly class SearchIndexAction
{
    public function __construct(
        private ReadPublicDocumentationHandler $handler,
        private JsonResponder $responses,
        private SiteLocaleResolver $locales,
    ) {
    }

    public function __invoke(ServerRequestInterface $request): JsonResponse
    {
        $locale = $this->locales->fromRequest($request);
        if ($locale === null) {
            throw DocumentationException::notFound();
        }

        $query   = $request->getQueryParams();
        $version = is_array($query) && is_string($query['version'] ?? null) && trim($query['version']) !== ''
            ? trim($query['version'])
            : null;
        $index = $this->handler->searchIndex($locale->code, $version);

        return $this->responses->success([
            'provider' => 'static',
            'locale'   => $locale->code,
            'version'  => is_array($index['versions']['selected'] ?? null)
                ? ($index['versions']['selected']['version'] ?? null)
                : null,
            'entries' => $index['entries'],
        ]);
    }
}
