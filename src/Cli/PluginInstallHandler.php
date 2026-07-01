<?php

declare(strict_types=1);

namespace App\Cli;

use App\Feature\Plugin\PluginInstaller;
use PhpSoftBox\CliApp\Command\HandlerInterface;
use PhpSoftBox\CliApp\Response;
use PhpSoftBox\CliApp\Runner\RunnerInterface;

use function implode;
use function is_string;
use function trim;

final readonly class PluginInstallHandler implements HandlerInterface
{
    public function __construct(
        private PluginInstaller $installer,
    ) {
    }

    public function run(RunnerInterface $runner): int|Response
    {
        $request = $runner->request();

        $result = $this->installer->install(
            manifestPath: $this->stringOption($request->option('manifest')),
            pluginsPath: $this->stringOption($request->option('plugins-dir')),
            runInstall: !$request->option('no-install', false),
            packageManager: $this->stringOption($request->option('package-manager')),
        );

        $runner->io()->writeln('Plugin manifest: ' . $result->manifestPath);
        $runner->io()->writeln('Plugin package: ' . $result->packagePath);

        if ($result->dependencies === []) {
            $runner->io()->writeln('No plugins configured.');

            return Response::SUCCESS;
        }

        $runner->io()->writeln('Plugins: ' . implode(', ', $result->dependencies));
        $runner->io()->writeln($result->installed ? 'Plugin dependencies installed.' : 'Plugin package generated without install.');

        return Response::SUCCESS;
    }

    private function stringOption(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
