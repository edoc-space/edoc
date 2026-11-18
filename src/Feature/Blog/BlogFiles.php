<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use function array_intersect;
use function explode;
use function is_dir;
use function is_file;
use function is_link;
use function preg_match;
use function realpath;
use function scandir;
use function sort;
use function str_starts_with;

use const SORT_STRING;

/** Local trusted build inputs. A mounted root may be a symlink; descendants may not. */
final class BlogFiles
{
    public static function file(string $root, string $relative): string
    {
        if (!self::relative($relative)) {
            throw new BlogException('blog.path: invalid relative path');
        }
        $base = realpath($root);
        if ($base === false) {
            throw new BlogException('blog.path: missing root');
        }
        $path = $base;
        foreach (explode('/', $relative) as $segment) {
            $path .= '/' . $segment;
            if (is_link($path)) {
                throw new BlogException('blog.path: symlinks are not allowed: ' . $relative);
            }
        }
        $real = realpath($path);
        if ($real === false || !str_starts_with($real, $base . '/') || !is_file($real)) {
            throw new BlogException('blog.path: file not found: ' . $relative);
        }

        return $real;
    }

    public static function relative(string $path): bool
    {
        return $path !== '' && preg_match('~^(?!/)(?!.*[\\\\\x00-\x1f%?#])[^/]+(?:/[^/]+)*$~D', $path) === 1
            && !array_intersect(explode('/', $path), ['.', '..']);
    }

    /** @return list<string> */
    public static function tree(string $root, string $prefix, bool $documentsOnly = false): array
    {
        if (!self::relative($prefix)) {
            throw new BlogException('blog.path: invalid collection');
        }
        $base = realpath($root);
        if ($base === false || !is_dir($base . '/' . $prefix)) {
            return [];
        }
        foreach (explode('/', $prefix) as $segment) {
            $base .= '/' . $segment;
            if (is_link($base)) {
                throw new BlogException('blog.path: symlink collection');
            }
        }
        $result = [];
        $walk   = static function (string $directory, string $relative) use (&$walk, &$result, $documentsOnly): void {
            foreach (scandir($directory) ?: [] as $name) {
                if ($name === '.' || $name === '..' || str_starts_with($name, '.')) {
                    continue;
                }
                if ($documentsOnly && !preg_match('/\.mdx?$/D', $name)
                    && (is_link($directory . '/' . $name) || !is_dir($directory . '/' . $name))) {
                    continue;
                }
                if (is_link($directory . '/' . $name)) {
                    throw new BlogException('blog.path: symlink: ' . $relative . '/' . $name);
                }
                if (is_dir($directory . '/' . $name)) {
                    $walk($directory . '/' . $name, $relative . '/' . $name);
                } elseif (is_file($directory . '/' . $name)) {
                    $result[] = $relative . '/' . $name;
                } else {
                    throw new BlogException('blog.path: non-regular input');
                }
            }
        };
        $walk($base, $prefix);
        sort($result, SORT_STRING);

        return $result;
    }
}
