<?php

declare(strict_types=1);

namespace App\Feature\Documentation;

use PhpSoftBox\Application\Exception\HttpException;

final class DocumentationException extends HttpException
{
    public static function notFound(): self
    {
        return new self(404, 'Узел документации не найден.', title: 'Not Found');
    }

    public static function validation(string $message): self
    {
        return new self(422, $message, title: 'Validation Failed');
    }
}
