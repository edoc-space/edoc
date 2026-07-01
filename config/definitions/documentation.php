<?php

declare(strict_types=1);

use App\Feature\Content\ContentRendererInterface;
use App\Feature\Documentation\DocumentationIndexBuilder;
use App\Feature\Documentation\DocumentationRenderer;
use App\Feature\Site\SiteLocaleResolver;
use App\Path;
use PhpSoftBox\Markdown\DefaultMarkdownSlugger;
use PhpSoftBox\Markdown\YamlFrontMatterParser;
use PhpSoftBox\Mdx\YamlMdxFrontMatterParser;
use PhpSoftBox\Profiler\ProfilerInterface;
use PhpSoftBox\Storage\Storage;
use Psr\Container\ContainerInterface;
use Psr\SimpleCache\CacheInterface;

use function PhpSoftBox\Container\factory;

return [
    DocumentationIndexBuilder::class => factory(
        static fn (ContainerInterface $container): DocumentationIndexBuilder => new DocumentationIndexBuilder(
            storage: $container->get(Storage::class),
            locales: $container->get(SiteLocaleResolver::class),
            frontMatterParser: $container->get(YamlFrontMatterParser::class),
            mdxFrontMatterParser: $container->get(YamlMdxFrontMatterParser::class),
            cache: $container->get(CacheInterface::class),
            path: $container->get(Path::class),
            profiler: $container->get(ProfilerInterface::class),
        ),
    ),

    DocumentationRenderer::class => factory(
        static fn (ContainerInterface $container): DocumentationRenderer => new DocumentationRenderer(
            storage: $container->get(Storage::class),
            renderer: $container->get(ContentRendererInterface::class),
            locales: $container->get(SiteLocaleResolver::class),
            slugger: $container->get(DefaultMarkdownSlugger::class),
            cache: $container->get(CacheInterface::class),
            profiler: $container->get(ProfilerInterface::class),
        ),
    ),
];
