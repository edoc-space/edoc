<?php

declare(strict_types=1);

namespace App\Feature\Site;

use Psr\Http\Message\ServerRequestInterface;

use function array_values;
use function explode;
use function is_array;
use function is_string;
use function preg_match;
use function rtrim;
use function str_contains;
use function strtolower;
use function trim;

final readonly class SeoMetaBuilder
{
    /**
     * @param list<array{locale:string,href:string}> $alternates
     * @return array{canonical:string,alternates:list<array{locale:string,href:string}>}
     */
    public function links(ServerRequestInterface $request, string $canonicalPath, array $alternates = []): array
    {
        return [
            'canonical'  => $this->absoluteUrl($request, $canonicalPath),
            'alternates' => $this->alternateLinks($request, $alternates),
        ];
    }

    public function absoluteUrl(ServerRequestInterface $request, string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            $path = '/';
        }

        if (preg_match('~^https?://~i', $path) === 1) {
            return $path;
        }

        if ($path[0] !== '/') {
            $path = '/' . $path;
        }

        return rtrim($this->origin($request), '/') . $path;
    }

    private function origin(ServerRequestInterface $request): string
    {
        $uri        = $request->getUri();
        $scheme     = $this->headerValue($request, 'x-forwarded-proto') ?: $uri->getScheme() ?: 'https';
        $host       = $this->headerValue($request, 'x-forwarded-host') ?: $request->getHeaderLine('Host');
        $appendPort = false;

        if ($host === '') {
            $host       = $uri->getHost();
            $appendPort = true;
        }

        $scheme = strtolower($scheme) === 'http' ? 'http' : 'https';
        $host   = trim($host);

        if ($host === '') {
            return $scheme . '://localhost';
        }

        if ($appendPort && !str_contains($host, ':')) {
            $port = $uri->getPort();
            if ($port !== null && !(($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80))) {
                $host .= ':' . $port;
            }
        }

        return $scheme . '://' . $host;
    }

    private function headerValue(ServerRequestInterface $request, string $name): string
    {
        $value = trim($request->getHeaderLine($name));
        if (str_contains($value, ',')) {
            [$value] = explode(',', $value, 2);
        }

        return trim($value);
    }

    /**
     * @param list<array{locale:string,href:string}> $alternates
     * @return list<array{locale:string,href:string}>
     */
    private function alternateLinks(ServerRequestInterface $request, array $alternates): array
    {
        $links = [];

        foreach (array_values($alternates) as $alternate) {
            if (!is_array($alternate)) {
                continue;
            }

            $locale = $alternate['locale'] ?? null;
            $href   = $alternate['href'] ?? null;
            if (!is_string($locale) || trim($locale) === '' || !is_string($href) || trim($href) === '') {
                continue;
            }

            $links[] = [
                'locale' => trim($locale),
                'href'   => $this->absoluteUrl($request, $href),
            ];
        }

        return $links;
    }
}
