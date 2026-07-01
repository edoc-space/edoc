<?php

declare(strict_types=1);

use App\Feature\Content\ContentRendererInterface;
use App\Feature\Content\MarkdownContentRenderer;
use PhpSoftBox\Markdown\MarkdownRenderer;
use Psr\Container\ContainerInterface;

use function PhpSoftBox\Container\factory;

return [
    ContentRendererInterface::class => factory(
        static fn (ContainerInterface $container): ContentRendererInterface => new MarkdownContentRenderer(
            $container->get(MarkdownRenderer::class),
        ),
    ),
];
