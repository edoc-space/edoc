<?php

declare(strict_types=1);

namespace App\Feature\Content;

interface ContentRendererInterface
{
    public function render(string $source, ContentRenderOptions $options): RenderedContent;
}
