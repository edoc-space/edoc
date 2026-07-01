<?php

declare(strict_types=1);

namespace App\Feature\Content;

final readonly class RenderedContent
{
    /**
     * @param array<string,mixed> $frontMatter
     * @param list<array<string,mixed>> $toc
     * @param list<array<string,mixed>> $diagnostics
     */
    public function __construct(
        public string $html,
        public array $frontMatter,
        public array $toc,
        public array $diagnostics,
    ) {
    }
}
