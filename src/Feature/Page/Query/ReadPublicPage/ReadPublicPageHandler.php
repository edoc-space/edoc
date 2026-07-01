<?php

declare(strict_types=1);

namespace App\Feature\Page\Query\ReadPublicPage;

use App\Feature\Page\PageRepository;

final readonly class ReadPublicPageHandler
{
    public function __construct(
        private PageRepository $pages,
    ) {
    }

    public function hasHomePage(?string $localeCode = null): bool
    {
        return $this->pages->hasHomePage($localeCode);
    }

    /**
     * @return array<string,mixed>
     */
    public function handle(?string $slugPath, ?string $localeCode = null): array
    {
        return $this->pages->publicView($slugPath, $localeCode);
    }

    /**
     * @param array<string,mixed> $current
     * @return list<array{locale:string,href:string}>
     */
    public function alternateLinks(array $current): array
    {
        return $this->pages->alternateLinks($current);
    }
}
