<?php

declare(strict_types=1);

namespace App\Feature\Content;

use PhpSoftBox\Markdown\Contracts\MarkdownLinkResolverInterface;
use PhpSoftBox\Markdown\MarkdownHtmlPolicy;

final readonly class ContentRenderOptions
{
    /**
     * @param list<string> $allowedCodeLanguages
     */
    public function __construct(
        public string $path,
        public ?MarkdownLinkResolverInterface $linkResolver = null,
        public MarkdownHtmlPolicy $htmlPolicy = MarkdownHtmlPolicy::Escape,
        public int $tocMinHeadingLevel = 2,
        public int $tocMaxHeadingLevel = 3,
        public ?string $externalLinkTarget = '_blank',
        public bool $externalLinksNoFollow = true,
        public array $allowedCodeLanguages = [],
    ) {
    }
}
