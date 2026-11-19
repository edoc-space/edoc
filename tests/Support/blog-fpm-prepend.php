<?php

use App\Feature\Blog\Clock;
use PhpSoftBox\Container\ContainerBuilder;

// Test-only DI bootstrap, mounted under /app in a disposable read-only FPM snapshot.
// The production public/index.php is left intact.
$engine = '/app/local/backend';
foreach (['APP_ENV' => 'prod', 'APP_DEBUG' => '0', 'APP_PROFILER' => '0', 'APP_DOCUMENTATION_CACHE' => '0', 'VITE_DEV_SERVER' => ''] as $key => $value) {
    $_ENV[$key] = $_SERVER[$key] = $value;
    putenv($key . '=' . $value);
}
require $engine . '/vendor/autoload.php';
require $engine . '/config/bootstrap.php';
header('X-EDoc-Test-Sapi: ' . PHP_SAPI);
header('X-EDoc-Test-Worker: ' . getmypid());
if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/__blog_transport') {
    $active = json_decode(file_get_contents($engine . '/local/build/blog/active.json'), true);
    $probe  = glob($engine . '/local/build/blog/' . $active['generation'] . '/*/entry.js')[0];
    header('Content-Type: application/json');
    echo json_encode(['sapi' => PHP_SAPI, 'php' => PHP_VERSION, 'privateReadable' => is_readable($probe), 'privateWritable' => is_writable($probe)]);
    exit;
}
$builder = new ContainerBuilder();

$builder->useAutowiring(true);
$builder->useAttributes(false);
$builder->addDefinitions(require $engine . '/config/dependencies.php');
$builder->addDefinitions([
    Clock::class => PhpSoftBox\Container\factory(static fn (): Clock => new class () implements Clock {
        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable(trim(file_get_contents('/app/blog-clock.txt')));
        }
    }),
]);
// Keep the real production middleware/routes/renderers; skip generated-container
// writes because FPM's entire source/private-output mount is intentionally read-only.
$container = $builder->build();
$app       = (require $engine . '/config/app.php')($container);
$app->run();
exit;
