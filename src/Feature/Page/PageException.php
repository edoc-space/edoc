<?php

declare(strict_types=1);

namespace App\Feature\Page;

use PhpSoftBox\Application\Exception\HttpException;

final class PageException extends HttpException
{
    public static function notFound(): self
    {
        return new self(404, 'Страница не найдена.', title: 'Not Found');
    }
}
