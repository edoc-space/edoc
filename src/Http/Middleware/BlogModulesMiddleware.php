<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Feature\Blog\BlogBuild;
use App\Feature\Blog\BlogRepository;
use PhpSoftBox\Http\Message\ResponseFactory;
use PhpSoftBox\Http\Message\StreamFactory;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Throwable;

use function count;
use function error_log;
use function explode;
use function in_array;
use function max;
use function min;
use function preg_match;
use function rawurldecode;
use function str_starts_with;
use function strlen;
use function substr;
use function trim;

/** Permanent guard, including disabled mode, before routes and the pages catch-all. */
final readonly class BlogModulesMiddleware implements MiddlewareInterface
{
    public function __construct(
        private BlogRepository $repository,
        private BlogBuild $build,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $raw  = $request->getUri()->getPath();
        $path = rawurldecode($raw);
        if (preg_match('~(?:^|/)blog/_modules(?:/|$)~', $path) !== 1) {
            return $handler->handle($request);
        }
        $response = new ResponseFactory()->createResponse(404)
            ->withHeader('Cache-Control', 'no-store')->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Accept-Ranges', 'none');

        if (!in_array($request->getMethod(), ['GET', 'HEAD'], true) || $raw !== $path) {
            return $response;
        }
        try {
            $policy = $this->repository->policy();
            foreach ($this->repository->locales() as $locale) {
                $prefix = $locale->url('/blog/_modules/');
                if (!str_starts_with($path, $prefix)) {
                    continue;
                }
                $parts = explode('/', substr($path, strlen($prefix)), 3);
                if (count($parts) !== 3 || !preg_match('/^[a-f0-9]{32}$/D', $parts[0]) || !preg_match('/^[a-f0-9]{32}$/D', $parts[1])) {
                    return $response;
                }
                foreach ($this->repository->publicRecords($locale, $policy) as $article) {
                    if ($article['key'] !== $parts[1]) {
                        continue;
                    }
                    $output = $this->build->output($article, $parts[0], $parts[2]);

                    return $this->assetResponse($response, $request, $output['mime'], $output['bytes']);
                }
            }
        } catch (Throwable $exception) {
            // Diagnostic codes only; paths and hidden metadata stay server-side.
            error_log('Blog module denied: ' . $exception::class);
        }

        return $response;
    }

    /** Range handling runs only after publication, identity and output hash validation. */
    private function assetResponse(ResponseInterface $response, ServerRequestInterface $request, string $mime, string $bytes): ResponseInterface
    {
        $size     = strlen($bytes);
        $response = $response->withStatus(200)->withHeader('Content-Type', $mime)->withHeader('Content-Length', (string) $size);
        if ($mime === 'video/mp4') {
            $response = $response->withHeader('Accept-Ranges', 'bytes');
        }
        if ($request->getMethod() === 'HEAD') {
            return $response;
        }
        $range = trim($request->getHeaderLine('Range'));
        // No validators are emitted: If-Range cannot match. Ignore unsupported/multiple ranges.
        if ($mime === 'video/mp4' && !$request->hasHeader('If-Range') && strlen($range) <= 128
            && preg_match('/^bytes=([0-9]*)-([0-9]*)$/D', $range, $match) === 1 && ($match[1] !== '' || $match[2] !== '')) {
            $start = $match[1] === '' ? max(0, $size - (int) $match[2]) : (int) $match[1];
            $end   = $match[1] === '' || $match[2] === '' ? $size - 1 : min($size - 1, (int) $match[2]);
            if ($size === 0 || $start >= $size || ($match[1] === '' && (int) $match[2] === 0) || $end < $start) {
                return $response->withStatus(416)->withHeader('Content-Range', 'bytes */' . $size)->withHeader('Content-Length', '0');
            }
            $bytes    = substr($bytes, $start, $end - $start + 1);
            $response = $response->withStatus(206)->withHeader('Content-Range', 'bytes ' . $start . '-' . $end . '/' . $size)
                ->withHeader('Content-Length', (string) strlen($bytes));
        }

        return $response->withBody(new StreamFactory()->createStream($bytes));
    }

}
