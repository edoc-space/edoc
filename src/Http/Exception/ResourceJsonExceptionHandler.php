<?php

declare(strict_types=1);

namespace App\Http\Exception;

use PhpSoftBox\Application\ErrorHandler\AbstractExceptionHandler;
use PhpSoftBox\Application\Response\JsonResponse;
use PhpSoftBox\Resource\ApiResponse;
use PhpSoftBox\Validator\Exception\ValidationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Throwable;

final class ResourceJsonExceptionHandler extends AbstractExceptionHandler
{
    public function handle(Throwable $exception, ServerRequestInterface $request): ResponseInterface
    {
        ['status' => $status, 'headers' => $headers] = $this->resolveStatusAndHeaders($exception);

        $response = ApiResponse::error(
            message: $this->resolveMessage($exception, $status),
            fields: $exception instanceof ValidationException ? $exception->errors() : [],
            meta: $this->includeDetails ? [
                'title'         => $this->resolveTitle($exception, $status),
                'debug_message' => $this->resolveDebugMessage($exception),
                'exception'     => $exception::class,
                'file'          => $exception->getFile(),
                'line'          => $exception->getLine(),
            ] : [],
            code: $this->code($exception, $status),
        );

        return new JsonResponse($response->toArray(), $status, $headers);
    }

    private function code(Throwable $exception, int $status): string
    {
        if ($exception instanceof ValidationException) {
            return 'validation_failed';
        }

        return match ($status) {
            400     => 'bad_request',
            401     => 'unauthorized',
            403     => 'forbidden',
            404     => 'not_found',
            405     => 'method_not_allowed',
            413     => 'payload_too_large',
            422     => 'validation_failed',
            429     => 'too_many_requests',
            default => $status >= 500 ? 'server_error' : 'request_failed',
        };
    }
}
