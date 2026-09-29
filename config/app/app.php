<?php

declare(strict_types=1);

return [
    'trusted_proxies' => array_values(array_filter(array_map('trim', explode(',', (string) env('APP_TRUSTED_PROXIES', ''))))),
    'env'             => env('APP_ENV', 'dev'),
    'debug'           => env('APP_DEBUG', '0') === '1',
    'url'             => env('APP_URL', 'https://domain.local'),
];
