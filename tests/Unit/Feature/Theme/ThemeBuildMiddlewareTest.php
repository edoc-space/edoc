<?php

declare(strict_types=1);

namespace App\Tests\Unit\Feature\Theme;

use App\Feature\Theme\ThemeBuild;
use App\Feature\Theme\ThemeResolver;
use App\Http\Middleware\ThemeBuildMiddleware;
use LogicException;
use PhpSoftBox\Http\Message\ResponseFactory;
use PhpSoftBox\Http\Message\ServerRequest;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

use function bin2hex;
use function dirname;
use function fclose;
use function file_get_contents;
use function file_put_contents;
use function is_file;
use function is_link;
use function json_encode;
use function mkdir;
use function proc_close;
use function proc_open;
use function random_bytes;
use function rmdir;
use function stream_get_contents;
use function symlink;
use function sys_get_temp_dir;
use function unlink;

use const JSON_THROW_ON_ERROR;
use const PHP_BINARY;

final class ThemeBuildMiddlewareTest extends TestCase
{
    public function testMissingManifestFailsClosedWithSafeDiagnosticAndHeadHasNoBody(): void
    {
        $resolver = new ThemeResolver(dirname(__DIR__, 4), sys_get_temp_dir() . '/edoc-absent-site');

        $middleware = new ThemeBuildMiddleware(new ThemeBuild($resolver, '/missing-build/theme.json'), true);
        $handler    = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                throw new LogicException('An invalid build must not reach the application.');
            }
        };
        $response = $middleware->process(new ServerRequest('GET', 'https://example.test/?theme=../../secret'), $handler);
        self::assertSame(503, $response->getStatusCode());
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        self::assertStringContainsString('theme.stale', (string) $response->getBody());
        self::assertStringNotContainsString(dirname(__DIR__, 4), (string) $response->getBody());
        self::assertStringNotContainsString('<script', (string) $response->getBody());
        self::assertSame('', (string) $middleware->process(new ServerRequest('HEAD', 'https://example.test/'), $handler)->getBody());
    }

    public function testNulEntryIsSafeForCliAndProductionGetAndHead(): void
    {
        $engine = dirname(__DIR__, 4);
        $root   = sys_get_temp_dir() . '/edoc-invalid-entry-' . bin2hex(random_bytes(6));
        mkdir($root . '/theme', 0775, true);
        file_put_contents($root . '/site.json', json_encode(['theme' => ['id' => 'local']], JSON_THROW_ON_ERROR));
        file_put_contents($root . '/theme/theme.json', json_encode(['contractVersion' => 1, 'entry' => "bad\0.tsx"], JSON_THROW_ON_ERROR));
        try {
            $middleware = new ThemeBuildMiddleware(new ThemeBuild(new ThemeResolver($engine, $root), $root . '/missing.json'), true);
            $handler    = new class () implements RequestHandlerInterface {
                public function handle(ServerRequestInterface $request): ResponseInterface
                {
                    throw new LogicException('Invalid entry reached downstream.');
                }
            };
            foreach (['GET', 'HEAD'] as $method) {
                $response = $middleware->process(new ServerRequest($method, 'https://example.test/'), $handler);
                self::assertSame(503, $response->getStatusCode());
                self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
                $body = (string) $response->getBody();
                if ($method === 'HEAD') {
                    self::assertSame('', $body);
                } else {
                    self::assertStringContainsString('theme.invalid', $body);
                }
                self::assertStringNotContainsString($engine, $body);
                self::assertStringNotContainsString($root, $body);
                self::assertStringNotContainsString('Stack trace', $body);
            }
            $process = proc_open([PHP_BINARY, $engine . '/tool/resolve-theme.php', $root], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            self::assertIsResource($process);
            fclose($pipes[0]);
            $stdout = stream_get_contents($pipes[1]);
            $stderr = stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            self::assertSame(1, proc_close($process));
            self::assertSame('', $stdout);
            self::assertStringContainsString('theme.invalid', $stderr);
            self::assertStringNotContainsString($root, $stderr);
            self::assertStringNotContainsString($engine, $stderr);
            self::assertStringNotContainsString('Stack trace', $stderr);
        } finally {
            unlink($root . '/theme/theme.json');
            unlink($root . '/site.json');
            rmdir($root . '/theme');
            rmdir($root);
        }
    }

    public function testWatchedDirectoryStaleGetHeadRebuildAndRecovery(): void
    {
        $root = sys_get_temp_dir() . '/edoc-watch-http-' . bin2hex(random_bytes(6));
        mkdir($root . '/data', 0775, true);
        mkdir($root . '/build', 0775, true);
        file_put_contents($root . '/data/input.txt', 'before');
        $resolver = new ThemeResolver(dirname(__DIR__, 4), $root);

        $theme    = $resolver->resolve();
        $original = $resolver->manifest($theme, [$root . '/data']);
        $save     = static fn (array $manifest) => file_put_contents($root . '/build/theme.json', json_encode($manifest, JSON_THROW_ON_ERROR));
        $save($original);
        $middleware = new ThemeBuildMiddleware(new ThemeBuild($resolver, $root . '/build/theme.json'), true);
        $handler    = new class () implements RequestHandlerInterface {
            public int $calls = 0;

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                ++$this->calls;

                return new ResponseFactory()->createResponse(204);
            }
        };
        try {
            self::assertSame(204, $middleware->process(new ServerRequest('GET', '/'), $handler)->getStatusCode());
            $mutations = [
                [static fn () => file_put_contents($root . '/data/input.txt', 'after'), static fn () => file_put_contents($root . '/data/input.txt', 'before')],
                [static fn () => file_put_contents($root . '/data/added.txt', 'added'), static fn () => unlink($root . '/data/added.txt')],
                [static fn () => unlink($root . '/data/input.txt'), static fn () => file_put_contents($root . '/data/input.txt', 'before')],
            ];
            foreach ($mutations as [$mutate, $recover]) {
                $mutate();
                $calls = $handler->calls;
                foreach (['GET', 'HEAD'] as $method) {
                    $response = $middleware->process(new ServerRequest($method, '/'), $handler);
                    self::assertSame(503, $response->getStatusCode());
                    self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
                    $body = (string) $response->getBody();
                    if ($method === 'HEAD') {
                        self::assertSame('', $body);
                    } else {
                        self::assertStringContainsString('theme.stale', $body);
                    }
                    self::assertStringNotContainsString($root, $body);
                    self::assertStringNotContainsString('<script', $body);
                }
                self::assertSame($calls, $handler->calls, 'Stale input must not reach downstream.');
                $save($resolver->manifest($theme, [$root . '/data']));
                self::assertSame(204, $middleware->process(new ServerRequest('GET', '/'), $handler)->getStatusCode());
                $recover();
                $save($original);
                self::assertSame(204, $middleware->process(new ServerRequest('GET', '/'), $handler)->getStatusCode());
            }
        } finally {
            foreach (['data/input.txt', 'data/added.txt', 'build/theme.json'] as $path) {
                if (is_file($root . '/' . $path)) {
                    unlink($root . '/' . $path);
                }
            }
            rmdir($root . '/data');
            rmdir($root . '/build');
            rmdir($root);
        }
    }

    public function testDeclaredFileAndDirectoryAliasRetargetGetHeadInBothDirections(): void
    {
        $root = sys_get_temp_dir() . '/edoc-alias-http-' . bin2hex(random_bytes(6));
        foreach (['targets/a', 'targets/b', 'nested/aliases', 'build'] as $directory) {
            mkdir($root . '/' . $directory, 0775, true);
        }
        file_put_contents($root . '/targets/a/input.txt', 'before');
        file_put_contents($root . '/targets/b/input.txt', 'after');
        $link = $root . '/nested/aliases/live';
        symlink('../../targets/a', $link);
        $point = static function (string $target) use ($link): void {
            unlink($link);
            symlink('../../targets/' . $target, $link);
        };
        $save     = static fn (array $manifest) => file_put_contents($root . '/build/theme.json', json_encode($manifest, JSON_THROW_ON_ERROR));
        $resolver = new ThemeResolver(dirname(__DIR__, 4), $root);

        try {
            foreach (['', '/input.txt'] as $suffix) {
                $path     = $link . $suffix;
                $original = $resolver->manifest($resolver->resolve(), [$path]);
                $save($original);
                $middleware = new ThemeBuildMiddleware(new ThemeBuild($resolver, $root . '/build/theme.json'), true);
                $handler    = new class () implements RequestHandlerInterface {
                    public int $calls = 0;

                    public function handle(ServerRequestInterface $request): ResponseInterface
                    {
                        ++$this->calls;

                        return new ResponseFactory()->createResponse(204);
                    }
                };
                $assertStale = static function () use ($middleware, $handler, $root): void {
                    $calls = $handler->calls;
                    foreach (['GET', 'HEAD'] as $method) {
                        $response = $middleware->process(new ServerRequest($method, '/'), $handler);
                        self::assertSame(503, $response->getStatusCode());
                        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
                        $body = (string) $response->getBody();
                        if ($method === 'HEAD') {
                            self::assertSame('', $body);
                        } else {
                            self::assertStringContainsString('theme.stale', $body);
                        }
                        self::assertStringNotContainsString($root, $body);
                        self::assertStringNotContainsString('<script', $body);
                    }
                    self::assertSame($calls, $handler->calls);
                };
                self::assertSame(204, $middleware->process(new ServerRequest('GET', '/'), $handler)->getStatusCode());
                $point('b');
                self::assertSame('after', file_get_contents($link . '/input.txt'));
                $assertStale();
                $changed = $resolver->manifest($resolver->resolve(), [$path]);
                self::assertNotSame($original['fingerprint'], $changed['fingerprint']);
                $save($changed);
                self::assertSame(204, $middleware->process(new ServerRequest('GET', '/'), $handler)->getStatusCode());
                $point('a');
                $assertStale();
                $save($original);
                self::assertSame(204, $middleware->process(new ServerRequest('GET', '/'), $handler)->getStatusCode());
            }
        } finally {
            if (is_link($link)) {
                unlink($link);
            }
            foreach (['targets/a/input.txt', 'targets/b/input.txt', 'build/theme.json'] as $path) {
                if (is_file($root . '/' . $path)) {
                    unlink($root . '/' . $path);
                }
            }
            foreach (['targets/a', 'targets/b', 'targets', 'nested/aliases', 'nested', 'build'] as $directory) {
                rmdir($root . '/' . $directory);
            }
            rmdir($root);
        }
    }

    public function testDevelopmentDoesNotRequireProductionOutput(): void
    {
        $middleware = new ThemeBuildMiddleware(new ThemeBuild(new ThemeResolver('/unused', '/unused'), '/unused'), false);
        $handler    = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return new ResponseFactory()->createResponse(204);
            }
        };
        self::assertSame(204, $middleware->process(new ServerRequest('GET', '/'), $handler)->getStatusCode());
    }
}
