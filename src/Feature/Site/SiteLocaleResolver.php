<?php

declare(strict_types=1);

namespace App\Feature\Site;

use JsonException;
use PhpSoftBox\Storage\Storage;
use Psr\Http\Message\ServerRequestInterface;

use function array_key_first;
use function array_values;
use function in_array;
use function is_array;
use function is_string;
use function json_decode;
use function preg_match;
use function rtrim;
use function str_starts_with;
use function strtolower;
use function trim;

use const JSON_THROW_ON_ERROR;

final class SiteLocaleResolver
{
    private const string CONFIG_PATH             = 'site.json';
    private const string IMPLICIT_DEFAULT_LOCALE = 'ru';

    /** @var list<SiteLocale>|null */
    private ?array $locales = null;

    public function __construct(
        private readonly Storage $storage,
    ) {
    }

    public function fromRequest(ServerRequestInterface $request): ?SiteLocale
    {
        $routeParams = $request->getAttribute('_route_params');
        $locale      = is_array($routeParams) && is_string($routeParams['locale'] ?? null)
            ? $routeParams['locale']
            : null;

        if ($locale !== null) {
            return $this->resolve($locale);
        }

        return $this->fromPath($request->getUri()->getPath());
    }

    public function resolve(?string $routeLocale): ?SiteLocale
    {
        $routeLocale = $this->normalizeCode($routeLocale ?? '');
        if ($routeLocale === '') {
            return $this->default();
        }

        foreach ($this->all() as $locale) {
            if ($locale->code !== $routeLocale) {
                continue;
            }

            return $locale->default ? null : $locale;
        }

        return null;
    }

    public function byCode(?string $localeCode): ?SiteLocale
    {
        $localeCode = $this->normalizeCode($localeCode ?? '');
        if ($localeCode === '') {
            return $this->default();
        }

        foreach ($this->all() as $locale) {
            if ($locale->code === $localeCode) {
                return $locale;
            }
        }

        return null;
    }

    public function default(): SiteLocale
    {
        foreach ($this->all() as $locale) {
            if ($locale->default) {
                return $locale;
            }
        }

        return $this->implicitDefaultLocale();
    }

    public function fromPath(string $path): SiteLocale
    {
        $path = '/' . trim($path, '/');
        if ($path === '//') {
            $path = '/';
        }

        foreach ($this->all() as $locale) {
            if ($locale->default || $locale->urlPrefix === '') {
                continue;
            }

            if ($path === $locale->urlPrefix || str_starts_with($path, $locale->urlPrefix . '/')) {
                return $locale;
            }
        }

        return $this->default();
    }

    /**
     * @return list<SiteLocale>
     */
    public function all(): array
    {
        if ($this->locales !== null) {
            return $this->locales;
        }

        $config        = $this->readConfig();
        $configured    = is_array($config['locales'] ?? null) ? array_values($config['locales']) : [];
        $defaultLocale = $this->normalizeCode(is_string($config['default_locale'] ?? null) ? $config['default_locale'] : '');

        if ($configured === []) {
            $this->locales = [$this->implicitDefaultLocale()];

            return $this->locales;
        }

        $locales = [];
        foreach ($configured as $item) {
            if (!is_array($item)) {
                continue;
            }

            $code = $this->normalizeCode(is_string($item['code'] ?? null) ? $item['code'] : '');
            if ($code === '') {
                continue;
            }

            $label = is_string($item['label'] ?? null) && trim($item['label']) !== ''
                ? trim($item['label'])
                : $code;

            $locales[$code] = [
                'code'         => $code,
                'label'        => $label,
                'path'         => is_string($item['path'] ?? null) ? trim($item['path']) : '',
                'content_path' => is_string($item['content_path'] ?? null) ? trim($item['content_path']) : '',
            ];
        }

        if ($locales === []) {
            $this->locales = [$this->implicitDefaultLocale()];

            return $this->locales;
        }

        if ($defaultLocale === '' || !isset($locales[$defaultLocale])) {
            $defaultLocale = (string) array_key_first($locales);
        }

        $resolved = [];
        foreach ($locales as $code => $locale) {
            $isDefault = $code === $defaultLocale;
            $prefix    = $isDefault ? '' : $this->normalizeUrlPrefix((string) $locale['path'], $code);
            $content   = $this->normalizeContentPrefix((string) $locale['content_path'], $code);

            $resolved[] = new SiteLocale(
                code: $code,
                label: (string) $locale['label'],
                urlPrefix: $prefix,
                contentPrefix: $content,
                default: $isDefault,
            );
        }

        $this->locales = $resolved;

        return $resolved;
    }

    public function hasSiteDisk(): bool
    {
        return in_array(SiteStorage::SITE_DISK, $this->storage->diskNames(), true);
    }

    /**
     * @return array<string,mixed>
     */
    private function readConfig(): array
    {
        if (!$this->hasSiteDisk()) {
            return [];
        }

        $storage = $this->storage->disk(SiteStorage::SITE_DISK);
        if ($storage->missing(self::CONFIG_PATH)) {
            return [];
        }

        try {
            $config = json_decode($storage->read(self::CONFIG_PATH), true, 512, JSON_THROW_ON_ERROR);

            return is_array($config) ? $config : [];
        } catch (JsonException) {
            return [];
        }
    }

    private function normalizeCode(string $code): string
    {
        $code = strtolower(trim($code));

        return preg_match('/^[a-z]{2}(?:-[a-z]{2})?$/', $code) === 1 ? $code : '';
    }

    private function implicitDefaultLocale(): SiteLocale
    {
        return new SiteLocale(
            self::IMPLICIT_DEFAULT_LOCALE,
            'Русский',
            '',
            self::IMPLICIT_DEFAULT_LOCALE,
            true,
        );
    }

    private function normalizeUrlPrefix(string $path, string $code): string
    {
        $path = trim($path);
        if ($path === '') {
            $path = '/' . $code;
        }

        $path = '/' . trim($path, '/');

        return rtrim($path, '/');
    }

    private function normalizeContentPrefix(string $path, string $code): string
    {
        $path = trim($path);
        if ($path === '') {
            return $code;
        }

        return trim($path, '/');
    }
}
