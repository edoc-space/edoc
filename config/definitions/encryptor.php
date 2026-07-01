<?php

declare(strict_types=1);

use PhpSoftBox\Encryptor\Contracts\EncryptedValueResolverInterface;
use PhpSoftBox\Encryptor\Contracts\EncryptorInterface;
use PhpSoftBox\Encryptor\Encryptor;

use function PhpSoftBox\Container\factory;
use function PhpSoftBox\Container\get;

return [
    EncryptorInterface::class => factory(static function (): EncryptorInterface {
        $key = env('APP_KEY', '');
        $key = $key !== '' ? $key : null;

        return new Encryptor(defaultKey: $key);
    }),

    EncryptedValueResolverInterface::class => get(EncryptorInterface::class),
];
