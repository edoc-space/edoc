<?php

declare(strict_types=1);

return [
    'dev_server'  => env('VITE_DEV_SERVER', 'https://vite.domain.local'),
    'manifest'    => 'public/build/.vite/manifest.json',
    'hot_file'    => 'public/hot',
    'build_base'  => '/build',
    'ssr_url'     => env('VITE_SSR_URL'),
    'ssr_entry'   => env('VITE_SSR_ENTRY', 'resources/js/ssr.tsx'),
    'ssr_timeout' => env('VITE_SSR_TIMEOUT', '2.0'),
    'entrypoints' => [
        'resources/js/app.tsx',
    ],
];
