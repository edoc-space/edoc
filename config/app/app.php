<?php

declare(strict_types=1);

return [
    'env'   => env('APP_ENV', 'dev'),
    'debug' => env('APP_DEBUG', '0') === '1',
    'url'   => env('APP_URL', 'https://domain.local'),
];
