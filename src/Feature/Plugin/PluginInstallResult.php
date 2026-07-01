<?php

declare(strict_types=1);

namespace App\Feature\Plugin;

final readonly class PluginInstallResult
{
    /**
     * @param list<string> $dependencies
     */
    public function __construct(
        public string $manifestPath,
        public string $pluginsPath,
        public string $packagePath,
        public array $dependencies,
        public bool $installed,
        public ?int $installExitCode = null,
    ) {
    }
}
