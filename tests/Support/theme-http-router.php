<?php

declare(strict_types=1);

$public = dirname(__DIR__, 2) . '/public';
$path   = realpath($public . (parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/'));
if (!preg_match('~(?:^|/)blog/_modules(?:/|$)~', rawurldecode((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH))) && $path !== false && str_starts_with($path, $public . '/') && is_file($path)) {
    return false;
}
require $public . '/index.php';
