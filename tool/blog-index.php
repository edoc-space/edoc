<?php

declare(strict_types=1);

use App\Feature\Blog\BlogRepository;
use App\Feature\Blog\BlogFiles;
use App\Feature\Blog\BlogException;
use App\Feature\Blog\BlogMarkdownLinkResolver;
use App\Feature\Content\ContentRendererInterface;
use App\Feature\Content\ContentRenderOptions;
use App\Feature\Site\SiteLocaleResolver;
use PhpSoftBox\Storage\Storage;

require dirname(__DIR__) . '/vendor/autoload.php';

try {
    $root = $argv[1] ?? dirname(__DIR__) . '/local/storage/edoc';
    $storage = new Storage(['default' => 'edoc_site', 'disks' => ['edoc_site' => ['driver' => 'local', 'rootPath' => $root]]]);
    $repository = new BlogRepository($root, new SiteLocaleResolver($storage));
    $container = require dirname(__DIR__) . '/config/container.php';
    $renderer = $container->get(ContentRendererInterface::class);
    $articles = [];
    if ($repository->config()['enabled']) {
        foreach ($repository->locales() as $locale) {
            $records = $repository->records($locale);
            foreach ($records as $article) {
                if ($article['preview'] !== null) {
                    $previewFile = BlogFiles::file($root, $article['preview']);
                    $info = @getimagesize($previewFile);
                    if (!is_array($info) || !in_array($info['mime'], ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'], true)) {
                        throw new BlogException('blog.preview: unsupported raster');
                    }
                    $extensionMime = match (strtolower(pathinfo($previewFile, PATHINFO_EXTENSION))) {
                        'png' => 'image/png', 'jpg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp',
                        'gif' => 'image/gif', 'avif' => 'image/avif',
                    };
                    if ($info['mime'] !== $extensionMime) {
                        throw new BlogException('blog.preview: raster type does not match extension');
                    }
                }
                $attachments = [];
                if ($article['format'] === 'markdown') {
                    $collector = static function (string $target, string $relative) use (&$attachments, $article, $root): string {
                        $own = str_ends_with($article['source'], '/index.md') ? dirname($article['source']) : substr($article['source'], 0, -3);
                        if (!str_starts_with($relative, $own . '/') || preg_match('/\.mdx?$/D', $relative)) {
                            throw new BlogException('blog.graph: attachment must be in article sidecar');
                        }
                        BlogFiles::file($root, $relative);
                        $attachments[$target] = $relative;
                        return '/prepared-attachment';
                    };
                    $renderer->render($article['body'], new ContentRenderOptions(
                        path: $article['source'], linkResolver: new BlogMarkdownLinkResolver($locale, $article['source'], $repository->articleLinks($locale), [], $collector),
                    ));
                }
                $articles[] = [...$article, 'attachments' => $attachments, 'prefix' => $locale->url('/blog/_modules'), 'date' => null, 'draft' => null];
            }
        }
    }
    echo json_encode(['site' => $repository->siteId(), 'enabled' => $repository->config()['enabled'], 'articles' => $articles], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
}
