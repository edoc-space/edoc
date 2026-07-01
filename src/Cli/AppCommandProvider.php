<?php

declare(strict_types=1);

namespace App\Cli;

use PhpSoftBox\CliApp\Command\Command;
use PhpSoftBox\CliApp\Command\CommandRegistryInterface;
use PhpSoftBox\CliApp\Command\OptionDefinition;
use PhpSoftBox\CliApp\Loader\CommandProviderInterface;

final class AppCommandProvider implements CommandProviderInterface
{
    public function register(CommandRegistryInterface $registry): void
    {
        $registry->register(Command::define(
            name: 'app:health',
            description: 'Check application bootstrap',
            signature: [],
            handler: HealthHandler::class,
        ));

        $registry->register(Command::define(
            name: 'plugins:install',
            description: 'Generate local plugin package and install configured plugin dependencies',
            signature: [
                new OptionDefinition('manifest', description: 'Path to edoc plugins.json manifest', default: 'local/storage/edoc/plugins.json'),
                new OptionDefinition('plugins-dir', description: 'Path to local plugins directory', default: 'local/plugins'),
                new OptionDefinition('package-manager', description: 'Package manager: yarn or npm', default: 'yarn'),
                new OptionDefinition('no-install', description: 'Only generate package.json without running package manager install', flag: true),
            ],
            handler: PluginInstallHandler::class,
        ));
    }
}
