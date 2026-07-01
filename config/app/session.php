<?php

declare(strict_types=1);

return [
    'name'             => env('APP_SESSION_NAME', 'psb_session'),
    'lifetime'         => (int) env('APP_SESSION_LIFETIME', '0'),
    'path'             => env('APP_SESSION_PATH', '/'),
    'domain'           => env('APP_SESSION_DOMAIN'),
    'secure'           => env('APP_SESSION_SECURE', 'always'),
    'http_only'        => env('APP_SESSION_HTTP_ONLY', '1') === '1',
    'same_site'        => env('APP_SESSION_SAME_SITE', 'Lax'),
    'use_strict_mode'  => env('APP_SESSION_STRICT', '1') === '1',
    'use_only_cookies' => env('APP_SESSION_ONLY_COOKIES', '1') === '1',
    'use_cookies'      => env('APP_SESSION_COOKIES', '1') === '1',
    'gc_max_lifetime'  => env('APP_SESSION_GC_MAX_LIFETIME'),
];
