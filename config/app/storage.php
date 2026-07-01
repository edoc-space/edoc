<?php

declare(strict_types=1);

return [
    'default' => env('APP_STORAGE_DISK', 'local'),
    'disks'   => [
        'local' => [
            'driver'  => 'local',
            'baseUrl' => env('APP_STORAGE_URL', '/storage'),
        ],
        'edoc_docs' => [
            'driver'   => 'local',
            'rootPath' => 'local/storage/edoc/ru/docs',
        ],
        'edoc_pages' => [
            'driver'   => 'local',
            'rootPath' => 'local/storage/edoc/ru/pages',
        ],
        'edoc_static' => [
            'driver'   => 'local',
            'rootPath' => 'local/storage/edoc/static',
            'baseUrl'  => '/storage/edoc/static',
        ],
        'edoc_site' => [
            'driver'   => 'local',
            'rootPath' => 'local/storage/edoc',
            'baseUrl'  => '/storage/edoc',
        ],
    ],
];
