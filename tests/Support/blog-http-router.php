<?php

declare(strict_types=1);

// Test-only clock injection. This router is never an application entry point.
use App\Feature\Blog\Clock;
use PhpSoftBox\Container\ContainerBuilder;

use function PhpSoftBox\Container\factory;

$engine = dirname(__DIR__, 2);
$public = $engine . '/public';
$uri    = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$file   = realpath($public . $uri);
if (!preg_match('~(?:^|/)blog/_modules(?:/|$)~', $uri) && $file !== false && str_starts_with($file, $public . '/') && is_file($file)) {
    return false;
}
require $engine . '/vendor/autoload.php';
require $engine . '/config/bootstrap.php';
$builder = new ContainerBuilder();

$builder->useAutowiring(true);
$builder->useAttributes(false);
$builder->addDefinitions(require $engine . '/config/dependencies.php');
$builder->addDefinitions([Clock::class => factory(static fn (): Clock => new class () implements Clock {
    public function now(): DateTimeImmutable
    {
        return new DateTimeImmutable(trim(file_get_contents('/evidence/blog-clock.txt')));
    }
})]);
$container = $builder->build();
$app       = (require $engine . '/config/app.php')($container);
$app->run();
