<?php

declare(strict_types=1);

use App\Feature\Theme\ThemeException;
use App\Feature\Theme\ThemeResolver;

require __DIR__ . '/../src/Feature/Theme/ThemeException.php';
require __DIR__ . '/../src/Feature/Theme/ThemeResolver.php';

try {
    $engine = dirname(__DIR__);
    $resolver = new ThemeResolver($engine, $argv[1] ?? $engine . '/local/storage/edoc');
    $theme = $resolver->resolve();
    if (($argv[2] ?? null) === 'manifest') {
        $files = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
        $theme = $resolver->manifest($theme, $files);
    }
    echo json_encode($theme, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), PHP_EOL;
} catch (ThemeException $exception) {
    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
}
