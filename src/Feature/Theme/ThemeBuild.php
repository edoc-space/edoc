<?php

declare(strict_types=1);

namespace App\Feature\Theme;

use JsonException;

use function file_get_contents;
use function is_array;
use function is_file;
use function json_decode;

use const JSON_THROW_ON_ERROR;

final readonly class ThemeBuild
{
    public function __construct(
        private ThemeResolver $resolver,
        private string $manifestPath,
    ) {
    }

    /** @return array{code:string,message:string}|null */
    public function diagnostic(): ?array
    {
        $manifest = null;
        if (is_file($this->manifestPath)) {
            try {
                $value    = json_decode((string) file_get_contents($this->manifestPath), true, flags: JSON_THROW_ON_ERROR);
                $manifest = is_array($value) ? $value : null;
            } catch (JsonException) {
                // A corrupt output must be diagnosed just like a missing/stale build.
            }
        }

        return $this->resolver->diagnostic($manifest);
    }
}
