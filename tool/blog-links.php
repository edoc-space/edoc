<?php

declare(strict_types=1);

use App\Feature\Blog\BlogRepository;
use App\Feature\Blog\BlogMarkdownLinkResolver;
use App\Feature\Blog\BlogFiles;
use App\Feature\Blog\BlogException;
use App\Feature\Site\SiteLocaleResolver;
use PhpSoftBox\Storage\Storage;

require dirname(__DIR__) . '/vendor/autoload.php';

try {
    [$root, $code, $source] = array_slice($argv, 1);
    $storage = new Storage(['default' => 'edoc_site', 'disks' => ['edoc_site' => ['driver' => 'local', 'rootPath' => $root]]]);
    $locales = new SiteLocaleResolver($storage);
    $locale = $locales->byCode($code);
    if ($locale === null) throw new BlogException('blog.link: invalid locale');
    $repository = new BlogRepository($root, $locales);
    $collector = static function (string $target, string $relative) use ($root, $source): string {
        $own = preg_match('~/index\.mdx?$~D', $source) ? dirname($source) : preg_replace('/\.mdx?$/D', '', $source);
        if (!str_starts_with($relative, $own . '/') || preg_match('/\.mdx?$/D', $relative)) throw new BlogException('blog.graph: private image outside article sidecar');
        BlogFiles::file($root, $relative);
        return '__asset__:' . $relative;
    };
    $resolver = new BlogMarkdownLinkResolver($locale, $source, $repository->articleLinks($locale), [], $collector);
    $targets = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
    $resolved = [];
    foreach ($targets as $target) $resolved[$target] = $resolver->resolveTarget($target);
    echo json_encode($resolved, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
}
