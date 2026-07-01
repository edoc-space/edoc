<?php

declare(strict_types=1);

use App\Http\Action\HealthAction;
use App\Http\Action\HomeAction;
use App\Http\Action\Web\Documentation\ShowDocumentationAction;
use App\Http\Action\Web\Page\ShowPageAction;
use PhpSoftBox\Profiler\Http\ProfilerReportHandler;
use PhpSoftBox\Router\RouteCollector;

$normalizeRouteLocale = static function (string $locale): string {
    $locale = trim($locale);

    return preg_match('/^[a-z]{2}(?:-[a-z]{2})?$/', $locale) === 1 ? $locale : '';
};

$localizedRoutePrefixes = static function () use ($normalizeRouteLocale): array {
    $configPath = dirname(__DIR__, 2) . '/local/storage/edoc/site.json';
    if (!is_file($configPath)) {
        return [];
    }

    $config = json_decode((string) file_get_contents($configPath), true);
    if (!is_array($config)) {
        return [];
    }

    $defaultLocale = $normalizeRouteLocale(is_string($config['default_locale'] ?? null) ? $config['default_locale'] : '');
    $locales       = is_array($config['locales'] ?? null) ? $config['locales'] : [];
    $prefixes      = [];

    foreach ($locales as $locale) {
        if (!is_array($locale)) {
            continue;
        }

        $code = $normalizeRouteLocale(is_string($locale['code'] ?? null) ? $locale['code'] : '');
        if ($code === '' || $code === $defaultLocale) {
            continue;
        }

        $prefix = is_string($locale['path'] ?? null) ? trim($locale['path']) : '';
        $prefix = $prefix === '' ? '/' . $code : '/' . trim($prefix, '/');
        $prefix = rtrim($prefix, '/');
        if ($prefix === '' || $prefix === '/') {
            continue;
        }

        $prefixes[$code] = $prefix;
    }

    return $prefixes;
};

return static function (RouteCollector $routes) use ($localizedRoutePrefixes): void {
    $routes->get('/', HomeAction::class)->name('home');
    $routes->get('/docs/{path*?}', ShowDocumentationAction::class)->name('docs.show');
    $routes->get('/health', HealthAction::class)->name('health');
    $routes->get('/__profiler/api/traces', ProfilerReportHandler::class)->name('profiler.traces');
    $routes->get('/__profiler/api/traces/{trace}', ProfilerReportHandler::class)->name('profiler.trace');

    foreach ($localizedRoutePrefixes() as $locale => $prefix) {
        $routes->get($prefix, HomeAction::class)
            ->default('locale', $locale)
            ->name('localized.' . $locale . '.home');
        $routes->get($prefix . '/docs/{path*?}', ShowDocumentationAction::class)
            ->default('locale', $locale)
            ->name('localized.' . $locale . '.docs.show');
        $routes->get($prefix . '/{path*}', ShowPageAction::class)
            ->default('locale', $locale)
            ->name('localized.' . $locale . '.pages.show');
    }

    $routes->get('/{path*}', ShowPageAction::class)->name('pages.show');
};
