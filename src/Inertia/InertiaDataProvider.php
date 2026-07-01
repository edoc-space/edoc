<?php

declare(strict_types=1);

namespace App\Inertia;

use PhpSoftBox\Inertia\Share\InertiaBaseDataProvider;
use Psr\Http\Message\ServerRequestInterface;

use function is_string;

class InertiaDataProvider extends InertiaBaseDataProvider
{
    public function share(ServerRequestInterface $request): array
    {
        $shared = parent::share($request);
        $token  = $request->getAttribute('csrf_token');

        if (is_string($token) && $token !== '') {
            $shared['csrf'] = [
                'token'  => $token,
                'header' => 'X-XSRF-TOKEN',
            ];
        }

        return $shared;
    }
}
