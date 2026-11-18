<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Feature\Theme\ThemeBuild;
use PhpSoftBox\Http\Message\ResponseFactory;
use PhpSoftBox\Http\Message\StreamFactory;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

use function htmlspecialchars;

use const ENT_QUOTES;
use const ENT_SUBSTITUTE;

/** Fail before serving an application with the wrong production theme. */
final readonly class ThemeBuildMiddleware implements MiddlewareInterface
{
    public function __construct(
        private ThemeBuild $build,
        private bool $production,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (!$this->production) {
            return $handler->handle($request);
        }
        $diagnostic = $this->build->diagnostic();
        if ($diagnostic === null) {
            return $handler->handle($request);
        }
        $message = htmlspecialchars($diagnostic['message'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $code    = htmlspecialchars($diagnostic['code'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $html    = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            . '<title>Требуется сборка темы</title><main><h1>Требуется сборка темы</h1><p>' . $message . '</p><code>' . $code . '</code></main></html>';

        return new ResponseFactory()->createResponse(503)
            ->withHeader('Content-Type', 'text/html; charset=utf-8')
            ->withHeader('Cache-Control', 'no-store')
            ->withBody(new StreamFactory()->createStream($request->getMethod() === 'HEAD' ? '' : $html));
    }
}
