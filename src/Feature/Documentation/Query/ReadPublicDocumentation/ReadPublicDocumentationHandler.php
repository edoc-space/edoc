<?php

declare(strict_types=1);

namespace App\Feature\Documentation\Query\ReadPublicDocumentation;

use App\Feature\Documentation\DocumentationRepository;

final readonly class ReadPublicDocumentationHandler
{
    public function __construct(
        private DocumentationRepository $documentation,
    ) {
    }

    /**
     * @return array<string,mixed>
     */
    public function handle(?string $slugPath, ?string $localeCode = null): array
    {
        return $this->documentation->publicView($slugPath, $localeCode);
    }

    /**
     * @return array{entries:list<array<string,mixed>>,versions:array<string,mixed>}
     */
    public function searchIndex(?string $localeCode = null, ?string $versionCode = null): array
    {
        return $this->documentation->searchIndex($localeCode, $versionCode);
    }

    /**
     * @return array{from:string,to:string,status:int,path:string}|null
     */
    public function redirectFor(?string $slugPath, ?string $localeCode = null): ?array
    {
        return $this->documentation->redirectFor($slugPath, $localeCode);
    }

    /**
     * @return array<string,mixed>
     */
    public function notFound(?string $slugPath, ?string $localeCode = null): array
    {
        return $this->documentation->notFoundView($slugPath, $localeCode);
    }

    /**
     * @param array<string,mixed> $current
     * @return list<array{locale:string,href:string}>
     */
    public function alternateLinks(array $current): array
    {
        return $this->documentation->alternateLinks($current);
    }
}
