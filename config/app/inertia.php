<?php

declare(strict_types=1);

use PhpSoftBox\Inertia\Area\InertiaAreaConfig;

return [
    'root_view' => 'resources/views/app.php',
    'root_id'   => 'app',
    'version'   => env('INERTIA_VERSION'),
    'ssr'       => env('INERTIA_SSR', '0') === '1',
    'areas'     => [
        'default' => 'web',
        'web'     => new InertiaAreaConfig(
            pathPrefixes: ['/'],
            ssr: null,
            shared: [
                'app' => [
                    'area' => 'web',
                ],
            ],
        ),
    ],
    'shared' => [
        'app' => [
            'env' => env('APP_ENV', 'dev'),
        ],
    ],
];
