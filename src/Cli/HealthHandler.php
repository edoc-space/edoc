<?php

declare(strict_types=1);

namespace App\Cli;

use PhpSoftBox\CliApp\Command\HandlerInterface;
use PhpSoftBox\CliApp\Response;
use PhpSoftBox\CliApp\Runner\RunnerInterface;
use PhpSoftBox\Config\Config;

use function env;

final readonly class HealthHandler implements HandlerInterface
{
    public function __construct(
        private Config $config,
    ) {
    }

    public function run(RunnerInterface $runner): int|Response
    {
        $runner->io()->writeln('App is ready.');
        $runner->io()->writeln('env=' . (string) $this->config->get('app.env', env('APP_ENV', 'dev')));
        $runner->io()->writeln('url=' . (string) $this->config->get('app.url', env('APP_URL', '')));

        return Response::SUCCESS;
    }
}
