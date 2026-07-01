<?php

declare(strict_types=1);

use App\Path;
use PhpSoftBox\Config\Config;
use PhpSoftBox\Storage\Contracts\StorageInterface;
use PhpSoftBox\Storage\Storage;
use Psr\Container\ContainerInterface;

use function PhpSoftBox\Container\factory;
use function PhpSoftBox\Container\get;

return [
    Storage::class => factory(static function (ContainerInterface $container): Storage {
        $config = (array) $container->get(Config::class)->get('storage', []);
        $path   = $container->get(Path::class);
        $disks  = is_array($config['disks'] ?? null) ? $config['disks'] : [];

        foreach ($disks as $name => $disk) {
            if (!is_array($disk)) {
                continue;
            }

            $driver = $disk['driver'] ?? 'local';
            $root   = $disk['rootPath'] ?? $disk['root'] ?? null;
            if (is_string($root) && $root !== '') {
                $disk['rootPath'] = $path->createPath($root);
            } elseif (!is_string($driver) || $driver === '' || $driver === 'local') {
                $disk['rootPath'] = $path->storagePath();
            }

            $disks[$name] = $disk;
        }

        $config['disks'] = $disks;

        return new Storage($config);
    }),

    StorageInterface::class => factory(
        static fn (ContainerInterface $container): StorageInterface => $container->get(Storage::class)->disk(),
    ),

    'storage' => get(Storage::class),
];
