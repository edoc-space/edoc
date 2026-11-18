<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use App\Feature\Theme\ThemeBuild;
use Throwable;

use function array_map;
use function explode;
use function file_get_contents;
use function hash;
use function hash_equals;
use function hash_file;
use function in_array;
use function is_array;
use function is_int;
use function is_string;
use function json_decode;
use function preg_match;
use function strlen;

use const JSON_THROW_ON_ERROR;

/** Private allowlist is never served. Old generations are never accepted. */
final readonly class BlogBuild
{
    public function __construct(
        private BlogRepository $repository,
        private string $engineRoot,
        private string $buildRoot,
        private ?ThemeBuild $themeBuild = null,
    ) {
    }

    /** Public metadata adapter. Private paths never leave the build boundary.
     * @param array<string,mixed> $article @return array<string,mixed>
     */
    public function summary(array $article): array
    {
        $preview = null;
        if (($article['preview'] ?? null) !== null && $this->repository->policy()->visible($article)) {
            try {
                $descriptor = $this->descriptor($article);
                $active     = $this->active();
                $file       = $active['articles'][$article['key']]['preview'];
                $output     = $this->output($article, $active['generation'], $file);
                if (!in_array($output['mime'], self::previewTypes(), true)) {
                    throw new BlogException('blog.preview: unsupported output');
                }
                $preview = $descriptor['preview'];
            } catch (Throwable) {
                // A list remains readable when its optional preview is unbuilt or unavailable.
            }
        }

        return [...$this->repository->summary($article), 'preview' => $preview];
    }

    /** @param array<string,mixed> $article @return array<string,mixed> */
    public function descriptor(array $article): array
    {
        $active = $this->active();
        $entry  = $active['articles'][$article['key']] ?? null;
        if (!is_array($entry) || $entry['source'] !== $article['source'] || $entry['slug'] !== $article['slug']
            || $entry['locale'] !== $article['locale'] || $entry['bodyDigest'] !== $article['bodyDigest']) {
            throw new BlogException('blog.stale: rebuild required');
        }
        foreach (['inputs', 'files', 'css', 'attachments'] as $field) {
            if (!is_array($entry[$field] ?? null)) {
                throw new BlogException('blog.stale: invalid manifest entry');
            }
        }
        if (($entry['entry'] !== null && (!is_string($entry['entry']) || !isset($entry['files'][$entry['entry']])))) {
            throw new BlogException('blog.stale: invalid entry output');
        }
        foreach ($entry['inputs'] as $input => $digest) {
            if (!is_string($input) || !preg_match('/^(site|engine|plugins):(.+)$/D', $input) || !is_string($digest) || !preg_match('/^[a-f0-9]{64}$/D', $digest)) {
                throw new BlogException('blog.stale: invalid input digest');
            }
            [$root, $path] = explode(':', $input, 2);
            $file          = BlogFiles::file(match ($root) {
                'site'    => $this->repository->siteRoot,
                'plugins' => $this->engineRoot . '/local/plugins/node_modules',
                default   => $this->engineRoot,
            }, $path);
            if (!hash_equals($digest, hash_file('sha256', $file))) {
                throw new BlogException('blog.stale: input changed; rebuild required');
            }
        }
        $localePrefix = null;
        foreach ($this->repository->locales() as $locale) {
            if ($locale->code === $article['locale']) {
                $localePrefix = $locale->url('/blog/_modules');
            }
        }
        if ($entry['prefix'] !== $localePrefix) {
            throw new BlogException('blog.stale: invalid locale namespace');
        }
        foreach ([...$entry['css'], ...$entry['attachments']] as $output) {
            if (!is_string($output) || !isset($entry['files'][$output])) {
                throw new BlogException('blog.stale: missing descriptor output');
            }
        }
        if (($entry['previewSource'] ?? null) !== ($article['preview'] ?? null)) {
            throw new BlogException('blog.stale: preview metadata changed');
        }
        $preview = $entry['preview'] ?? null;
        if (($article['preview'] ?? null) !== null && (!is_string($preview) || !BlogFiles::relative($preview)
            || !isset($entry['inputs']['site:' . $article['preview']], $entry['files'][$preview])
            || !in_array($entry['files'][$preview]['mime'] ?? null, self::previewTypes(), true))) {
            throw new BlogException('blog.stale: invalid preview output');
        }
        $prefix = $localePrefix . '/' . $active['generation'] . '/' . $article['key'] . '/';

        return ['preview' => $preview === null ? null : $prefix . $preview, 'abi' => $active['abi'], 'entry' => $entry['entry'] === null ? null : $prefix . $entry['entry'],
            'css'         => array_map(static fn (string $file): string => $prefix . $file, $entry['css']),
            'assets'      => array_map(static fn (string $file): string => $prefix . $file, $entry['attachments']),
        ];
    }

    /** @param array<string,mixed> $article @return array{bytes:string,mime:string} */
    public function output(array $article, string $generation, string $file): array
    {
        $this->descriptor($article);
        $active  = $this->active();
        $allowed = $active['articles'][$article['key']]['files'][$file] ?? null;
        if ($active['generation'] !== $generation || !is_array($allowed) || !BlogFiles::relative($file)
            || !is_int($allowed['size'] ?? null) || $allowed['size'] < 0
            || !is_string($allowed['hash'] ?? null) || !is_string($allowed['mime'] ?? null)) {
            throw new BlogException('blog.output: unavailable');
        }
        $path  = BlogFiles::file($this->buildRoot, $generation . '/' . $article['key'] . '/' . $file);
        $bytes = file_get_contents($path);
        if (strlen($bytes) !== $allowed['size'] || !hash_equals($allowed['hash'], hash('sha256', $bytes))
            || !in_array($allowed['mime'], self::mimeTypes(), true)) {
            throw new BlogException('blog.output: corrupt output');
        }

        return ['bytes' => $bytes, 'mime' => $allowed['mime']];
    }

    /** @return array<string,mixed> */
    private function active(): array
    {
        if ($this->themeBuild !== null && $this->themeBuild->diagnostic() !== null) {
            throw new BlogException('blog.stale: public runtime inputs changed');
        }
        try {
            $active  = json_decode(file_get_contents(BlogFiles::file($this->buildRoot, 'active.json')), true, flags: JSON_THROW_ON_ERROR);
            $runtime = json_decode(file_get_contents(BlogFiles::file($this->engineRoot, 'public/build/blog-runtime.json')), true, flags: JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            throw new BlogException('blog.stale: build missing');
        }
        if (($active['schema'] ?? null) !== 1 || ($active['site'] ?? null) !== $this->repository->siteId()
            || !is_string($active['abi'] ?? null) || $active['abi'] !== ($runtime['abi'] ?? null)
            || !preg_match('/^[a-f0-9]{32}$/D', $active['generation'] ?? '')) {
            throw new BlogException('blog.stale: incompatible build');
        }

        return $active;
    }

    /** @return list<string> */
    private static function previewTypes(): array
    {
        return ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
    }

    /** @return list<string> */
    private static function mimeTypes(): array
    {
        return ['text/javascript', 'text/css', 'image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
            'image/avif', 'font/woff2', 'font/woff', 'application/pdf', 'text/plain', 'application/json', 'video/mp4', 'audio/mpeg'];
    }
}
