<?php

declare(strict_types=1);

namespace App\Feature\Site;

use function ltrim;
use function rtrim;
use function str_starts_with;
use function strlen;
use function substr;
use function trim;

final readonly class SiteLocale
{
    public function __construct(
        public string $code,
        public string $label,
        public string $urlPrefix,
        public string $contentPrefix,
        public bool $default,
    ) {
    }

    public function url(string $path = '/'): string
    {
        $path = trim($path);
        if ($path === '') {
            $path = '/';
        }

        if (!str_starts_with($path, '/')) {
            $path = '/' . $path;
        }

        if ($this->urlPrefix === '') {
            return $path;
        }

        if ($path === '/') {
            return $this->urlPrefix;
        }

        if ($path === $this->urlPrefix || str_starts_with($path, $this->urlPrefix . '/')) {
            return $path;
        }

        return $this->urlPrefix . $path;
    }

    public function contentPath(string $section, string $path = ''): string
    {
        $section = trim($section, '/');
        $path    = ltrim($path, '/');
        $root    = trim($this->contentPrefix . '/' . $section, '/');

        return $path === '' ? $root : $root . '/' . $path;
    }

    public function modulePath(string $section, string $path): string
    {
        return '/local/storage/edoc/' . $this->contentPath($section, $path);
    }

    public function stripContentPath(string $section, string $path): string
    {
        $root = $this->contentPath($section);
        $path = trim($path, '/');

        if ($root !== '' && str_starts_with($path, rtrim($root, '/') . '/')) {
            return ltrim(substr($path, strlen($root)), '/');
        }

        return $path;
    }
}
