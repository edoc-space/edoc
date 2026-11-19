<?php

declare(strict_types=1);

namespace App\Tests\Unit\Feature\Blog;

use App\Feature\Blog\BlogBuild;
use App\Feature\Blog\BlogException;
use App\Feature\Blog\BlogFeed;
use App\Feature\Blog\BlogListException;
use App\Feature\Blog\BlogListQuery;
use App\Feature\Blog\BlogRepository;
use App\Feature\Blog\Clock;
use App\Feature\Blog\LatestArticles;
use App\Feature\Site\SeoMetaBuilder;
use App\Feature\Site\SiteConfigRepository;
use App\Feature\Site\SiteLocaleResolver;
use App\Http\Middleware\BlogModulesMiddleware;
use DateTimeImmutable;
use FilesystemIterator;
use PhpSoftBox\Http\Message\ResponseFactory;
use PhpSoftBox\Http\Message\ServerRequest;
use PhpSoftBox\Storage\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SimpleXMLElement;

use function array_column;
use function array_keys;
use function bin2hex;
use function dirname;
use function file_get_contents;
use function file_put_contents;
use function hash;
use function is_dir;
use function json_decode;
use function json_encode;
use function mkdir;
use function random_bytes;
use function rmdir;
use function str_repeat;
use function str_replace;
use function strlen;
use function symlink;
use function sys_get_temp_dir;
use function unlink;

use const JSON_THROW_ON_ERROR;

final class BlogRepositoryTest extends TestCase
{
    private string $root;
    private BlogRepository $repository;
    private SiteLocaleResolver $locales;
    private Clock $clock;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/edoc-blog-' . bin2hex(random_bytes(6));
        mkdir($this->root, 0775, true);
        $this->put('site.json', json_encode(['blog' => ['enabled' => true], 'default_locale' => 'ru', 'locales' => [['code' => 'ru'], ['code' => 'en']]], JSON_THROW_ON_ERROR));
        $storage = new Storage(['default' => 'edoc_site', 'disks' => ['edoc_site' => ['driver' => 'local', 'rootPath' => $this->root]]]);

        $this->locales = new SiteLocaleResolver($storage);

        $this->clock = new class () implements Clock {
            public DateTimeImmutable $instant;
            public function __construct()
            {
                $this->instant = new DateTimeImmutable('2026-11-13T11:59:59Z');
            }
            public function now(): DateTimeImmutable
            {
                return $this->instant;
            }
        };
        $this->repository = new BlogRepository($this->root, $this->locales, $this->clock);
    }

    protected function tearDown(): void
    {
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($this->root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);

        foreach ($files as $file) {
            $file->isDir() && !$file->isLink() ? rmdir($file->getPathname()) : unlink($file->getPathname());
        }
        rmdir($this->root);
    }

    public function testWarmCacheTimeBoundaryAndRevocationDoNotNeedClearOrRestart(): void
    {
        $this->article('ru/blog/future.mdx', 'future', '2026-11-13T12:00:00Z');
        $this->article('ru/blog/a.md', 'a', '2026-01-01T00:00:00Z');
        $this->article('ru/blog/b.md', 'b', '2026-01-01T00:00:00Z');
        $this->article('ru/blog/draft.md', 'draft', '2026-01-01T00:00:00Z', true);
        $view = fn (): array => $this->repository->publicRecords($this->locales->default(), $this->repository->policy());
        self::assertSame(['a', 'b'], array_column($view(), 'slug'));
        $this->clock->instant = new DateTimeImmutable('2026-11-13T12:00:00Z');
        self::assertSame(['future', 'a', 'b'], array_column($view(), 'slug'));
        $this->clock->instant = new DateTimeImmutable('2026-11-13T12:00:01Z');
        self::assertCount(3, $view());
        $this->article('ru/blog/future.mdx', 'future', '2026-11-13T12:00:00Z', true);
        self::assertSame(['a', 'b'], array_column($view(), 'slug'));
        $this->article('ru/blog/future.mdx', 'future', '2027-11-13T12:00:00Z');
        self::assertCount(2, $view());
        $this->article('ru/blog/future.mdx', 'future', '2026-11-13T12:00:00Z');
        $this->repository->clear();
        self::assertCount(3, $view());
        self::assertCount(3, new BlogRepository($this->root, $this->locales, $this->clock)->publicRecords($this->locales->default(), $this->repository->policy()));
    }

    public function testArticleLinkIdentityStaysAvailableWithoutExposingHiddenMetadataOnWarmCache(): void
    {
        $this->article('ru/blog/source.md', 'source', '2026-01-01');
        foreach ([
            ['2026-11-13T11:59:59Z', '2026-11-13T12:00:00Z', false, 1],
            ['2026-11-13T12:00:00Z', '2026-11-13T12:00:00Z', false, 2],
            ['2026-11-13T12:00:01Z', '2026-11-13T12:00:00Z', true, 1],
            ['2026-11-13T12:00:01Z', '2027-11-13T12:00:00Z', false, 1],
            ['2026-11-13T12:00:01Z', '2026-11-13T12:00:00Z', false, 2],
        ] as [$now, $date, $draft, $visible]) {
            $this->article('ru/blog/target.mdx', 'stable-address', $date, $draft);
            $this->clock->instant = new DateTimeImmutable($now);

            self::assertCount($visible, $this->repository->publicRecords($this->locales->default(), $this->repository->policy()));
            self::assertSame([
                'ru/blog/source.md' => '/blog/source', 'ru/blog/target.mdx' => '/blog/stable-address',
            ], $this->repository->articleLinks($this->locales->default()));
        }
    }

    public function testLocalesSitesAlternatesAndBodyDigestIsolation(): void
    {
        $this->article('ru/blog/a.md', 'a', '2026-01-01');
        $this->article('en/blog/a.md', 'a', '2026-01-01');
        $this->article('en/blog/hidden.md', 'hidden', '2026-01-01', true);
        $ru = $this->repository->records($this->locales->default())['a'];
        $en = $this->repository->records($this->locales->byCode('en'))['a'];
        self::assertNotSame($ru['key'], $en['key']);
        self::assertSame('/en/blog/a', $en['href']);
        self::assertCount(2, $this->repository->alternates($ru, $this->repository->policy()));
        $this->article('ru/blog/a.md', 'a', '2027-01-01', true);
        $changed = $this->repository->records($this->locales->default())['a'];
        self::assertSame($ru['bodyDigest'], $changed['bodyDigest']);
        self::assertSame($ru['href'], $changed['href']);
        self::assertStringNotContainsString('body', json_encode($this->repository->summary($changed), JSON_THROW_ON_ERROR));
    }

    #[DataProvider('invalidMetadata')]
    public function testInvalidContentFailsWithRelativeSource(string $metadata): void
    {
        $this->put('ru/blog/bad.md', "---\n" . $metadata . "\n---\nTEXT");
        try {
            $this->repository->records($this->locales->default());
            self::fail('Invalid content accepted');
        } catch (BlogException $exception) {
            self::assertStringContainsString('ru/blog/bad.md', $exception->getMessage());
            self::assertStringNotContainsString($this->root, $exception->getMessage());
        }
    }

    public static function invalidMetadata(): array
    {
        $base = "title: valid\ndescription: valid\ndate: '2026-01-01'\n";

        return [[$base . "image: '/storage/edoc/static/missing.svg'"], [$base . 'slug: _modules/x'], [$base . 'slug: tags/a'], [$base . 'slug: ../outside'],
            [$base . 'tags: nope'], [$base . 'tags: [valid, 12]'], [$base . 'draft: nope'], [$base . 'slug: nested/_hidden'], [$base . 'translation_key: 12'],
            ["title: ''\ndescription: valid\ndate: '2026-01-01'"], ["title: valid\ndate: '2026-01-01'"],
            ["title: valid\ndescription: valid\ndate: '2026-02-30'"], ["title: valid\ndescription: valid\ndate: '2026-01-01T00:00:00+99:99'"], ["title: [broken\n"],
        ];
    }

    public function testInvalidTimezoneDoesNotFallBackToHostClock(): void
    {
        $this->put('site.json', '{"blog":{"enabled":true},"timezone":"Invalid/Zone"}');
        $this->expectException(BlogException::class);
        $this->repository->config();
    }

    public function testDuplicateSlugsAndPageConflictsDoNotPickWinner(): void
    {
        $this->article('ru/blog/a.md', 'same', '2026-01-01');
        $this->article('ru/blog/b.md', 'same', '2026-01-01');
        try {
            $this->repository->records($this->locales->default());
            self::fail('duplicate accepted');
        } catch (BlogException $exception) {
            self::assertStringContainsString('ru/blog/a.md', $exception->getMessage());
            self::assertStringContainsString('ru/blog/b.md', $exception->getMessage());
        }
        unlink($this->root . '/ru/blog/b.md');
        $this->put('ru/pages/blog.md', "---\ntitle: Page\n---\nPAGE");
        $this->expectException(BlogException::class);
        $this->repository->records($this->locales->default());
    }

    public function testSameSlugAtAnotherSiteCannotUseAnActiveManifestFromFirstSite(): void
    {
        $this->article('ru/blog/a.mdx', 'a', '2026-01-01');
        $this->put('second/site.json', '{"blog":{"enabled":true}}');
        $this->put('second/ru/blog/a.mdx', "---\ntitle: Other site\ndescription: Other data\ndate: '2025-01-01'\ntags: [other-site]\n---\nOTHER_BODY");
        $storage = new Storage(['default' => 'edoc_site', 'disks' => ['edoc_site' => ['driver' => 'local', 'rootPath' => $this->root . '/second']]]);

        $otherLocales = new SiteLocaleResolver($storage);

        $other  = new BlogRepository($this->root . '/second', $otherLocales, $this->clock);
        $first  = $this->repository->records($this->locales->default())['a'];
        $second = $other->records($otherLocales->default())['a'];
        self::assertNotSame($this->repository->siteId(), $other->siteId());
        self::assertNotSame($first['key'], $second['key']);
        self::assertSame('Other site', $other->summary($second)['title']);
        $firstView  = $this->repository->listing($this->locales->default(), $this->repository->policy())->select(BlogListQuery::parse('', []), $this->locales->default());
        $secondView = $other->listing($otherLocales->default(), $other->policy())->select(BlogListQuery::parse('', []), $otherLocales->default());
        self::assertSame(['a'], array_column($firstView['articles'], 'slug'));
        self::assertSame(['a'], array_column($secondView['articles'], 'slug'));
        self::assertSame([], $firstView['tags']);
        self::assertSame(['other-site'], array_column($secondView['tags'], 'value'));
        self::assertSame([2026], array_column($firstView['years'], 'value'));
        self::assertSame([2025], array_column($secondView['years'], 'value'));
        self::assertSame('Other site', $secondView['articles'][0]['title']);
        $this->put('build/active.json', json_encode(['schema' => 1, 'site' => $this->repository->siteId(), 'abi' => 'same', 'generation' => str_repeat('a', 32), 'articles' => []], JSON_THROW_ON_ERROR));
        $this->put('public/build/blog-runtime.json', '{"abi":"same"}');
        $this->expectException(BlogException::class);
        new BlogBuild($other, $this->root, $this->root . '/build')->descriptor($second);
    }

    public function testSymlinkCannotReadOutsideCollection(): void
    {
        $this->put('secret.md', 'SECRET');
        mkdir($this->root . '/ru/blog', 0775, true);
        symlink($this->root . '/secret.md', $this->root . '/ru/blog/leak.md');
        $this->expectException(BlogException::class);
        $this->repository->records($this->locales->default());
    }

    public function testEveryOutputUsesPolicyIdentityHashesAndNoStoreForGetHeadRangeAndConditionalRequests(): void
    {
        $this->article('ru/blog/a.mdx', 'a', '2026-11-13T12:00:00Z');
        $record     = $this->repository->records($this->locales->default())['a'];
        $generation = str_repeat('a', 32);
        $abi        = str_repeat('b', 64);
        $files      = ['entry.js' => ['mime' => 'text/javascript', 'size' => 6, 'hash' => hash('sha256', 'SECRET')]];
        $entry      = ['source' => $record['source'], 'slug' => 'a', 'locale' => 'ru', 'prefix' => '/blog/_modules',
            'bodyDigest'        => $record['bodyDigest'], 'inputs' => [], 'files' => $files, 'entry' => 'entry.js', 'css' => [], 'attachments' => []];
        $active = ['schema' => 1, 'site' => $this->repository->siteId(), 'abi' => $abi, 'generation' => $generation, 'articles' => [$record['key'] => $entry]];
        $this->put('build/active.json', json_encode($active, JSON_THROW_ON_ERROR));
        $this->put('public/build/blog-runtime.json', json_encode(['abi' => $abi], JSON_THROW_ON_ERROR));
        $this->put('build/' . $generation . '/' . $record['key'] . '/entry.js', 'SECRET');
        $build = new BlogBuild($this->repository, $this->root, $this->root . '/build');

        $middleware = new BlogModulesMiddleware($this->repository, $build);
        $handler    = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return new ResponseFactory()->createResponse(418);
            }
        };
        $url  = 'https://example.test/blog/_modules/' . $generation . '/' . $record['key'] . '/entry.js';
        $call = static fn (string $method = 'GET', ?string $target = null): ResponseInterface => $middleware->process(
            new ServerRequest($method, $target ?? $url)->withHeader('If-None-Match', 'old')->withHeader('Range', 'bytes=0-1'),
            $handler,
        );
        self::assertSame(404, $call()->getStatusCode());
        $this->clock->instant = new DateTimeImmutable('2026-11-13T12:00:00Z');
        foreach (['GET', 'HEAD'] as $method) {
            $response = $call($method);
            self::assertSame(200, $response->getStatusCode());
            self::assertSame($method === 'GET' ? 'SECRET' : '', (string) $response->getBody());
            self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
            self::assertSame('none', $response->getHeaderLine('Accept-Ranges'));
            self::assertSame('', $response->getHeaderLine('ETag'));
            self::assertSame('text/javascript', $response->getHeaderLine('Content-Type'));
        }
        foreach (['/entry.js.map', '/active.json', '/%2e%2e/entry.js'] as $bad) {
            self::assertSame(404, $call('GET', dirname($url) . $bad)->getStatusCode());
        }
        self::assertSame(404, $call('GET', str_replace($generation, str_repeat('c', 32), $url))->getStatusCode());
        $this->article('ru/blog/a.mdx', 'a', '2026-11-13T12:00:00Z', true);
        self::assertSame(404, $call()->getStatusCode());
        $this->article('ru/blog/a.mdx', 'a', '2026-11-13T12:00:00Z');
        self::assertSame(200, $call()->getStatusCode());
        $this->put('build/' . $generation . '/' . $record['key'] . '/entry.js', 'BROKEN');
        self::assertSame(404, $call()->getStatusCode());
        $this->put('build/' . $generation . '/' . $record['key'] . '/entry.js', 'SECRET');
        $this->put('public/build/blog-runtime.json', json_encode(['abi' => 'other'], JSON_THROW_ON_ERROR));
        self::assertSame(404, $call()->getStatusCode());
        $this->put('public/build/blog-runtime.json', json_encode(['abi' => $abi], JSON_THROW_ON_ERROR));
        $this->put('ru/blog/a.mdx', file_get_contents($this->root . '/ru/blog/a.mdx') . 'new body');
        self::assertSame(404, $call()->getStatusCode());
        $this->put('site.json', '{"blog":{"enabled":false}}');
        self::assertSame(404, $call()->getStatusCode());
        self::assertSame(418, $call('GET', 'https://example.test/blog')->getStatusCode());
    }

    public function testAcceptanceListingUsesOneVisibleViewWithFacetsPaginationAndTimezone(): void
    {
        $this->put('site.json', '{"blog":{"enabled":true,"page_size":5},"timezone":"UTC","default_locale":"ru","locales":[{"code":"ru"},{"code":"en"}]}');
        $data = json_decode(file_get_contents(__DIR__ . '/../../../Fixtures/blog-list.json'), true, flags: JSON_THROW_ON_ERROR);
        foreach ($data as [$slug, $date, $tags]) {
            $this->article('ru/blog/' . $slug . '.md', $slug, $date);
            $path = $this->root . '/ru/blog/' . $slug . '.md';
            file_put_contents($path, str_replace('draft: false', 'tags: ' . json_encode($tags, JSON_THROW_ON_ERROR) . "\ndraft: false", file_get_contents($path)));
        }
        $this->article('ru/blog/hidden.md', 'hidden', '2026-01-01', true);
        $this->article('en/blog/p01.md', 'p01', '2026-01-01');
        $this->article('en/blog/p04.md', 'p04', '2026-01-01');
        $this->article('en/blog/en-only.md', 'en-only', '2026-01-01');
        $view   = fn () => $this->repository->listing($this->locales->default(), $this->repository->policy());
        $select = fn (string $path = '', array $query = []) => $view()->select(BlogListQuery::parse($path, $query), $this->locales->default());
        $all    = [];
        foreach ([1 => 5, 2 => 5, 3 => 3] as $page => $count) {
            $result = $select('', ['page' => (string) $page]);
            self::assertCount($count, $result['articles']);
            $all = [...$all, ...array_column($result['articles'], 'slug')];
        }
        self::assertSame(array_column($data, 0), $all);
        self::assertSame(8, $select('tags/php')['total']);
        self::assertSame(8, $select('archive/2026')['total']);
        $combined = $select('tags/php', ['year' => '2026']);
        self::assertSame(6, $combined['total']);
        self::assertSame('/blog/tags/php?year=2026&page=2', $combined['pagination']['next']);
        self::assertCount(1, $select('tags/php', ['year' => '2026', 'page' => '2'])['articles']);
        self::assertSame(0, $select('tags/заметки', ['year' => '2026'])['total']);
        self::assertSame([2026 => 8, 2025 => 5], array_column($select()['years'], 'count', 'value'));
        self::assertSame(3, $this->repository->listing($this->locales->byCode('en'), $this->repository->policy())->select(BlogListQuery::parse('', []), $this->locales->byCode('en'))['total']);
        $this->put('site.json', str_replace('UTC', 'Europe/Amsterdam', file_get_contents($this->root . '/site.json')));
        self::assertSame(9, $select('archive/2026')['total']);
        self::assertSame(7, $select('tags/php', ['year' => '2026'])['total']);
    }

    public function testListingReevaluatesPublicationAndEditsOnWarmRepositoryCache(): void
    {
        $this->article('ru/blog/future.md', 'future', '2026-11-13T12:00:00Z');
        $path = $this->root . '/ru/blog/future.md';
        file_put_contents($path, str_replace('draft: false', "tags: [secret]\ndraft: false", file_get_contents($path)));
        $select = fn () => $this->repository->listing($this->locales->default(), $this->repository->policy())->select(BlogListQuery::parse('', []), $this->locales->default());
        self::assertSame([], $select()['tags']);
        $this->clock->instant = new DateTimeImmutable('2026-11-13T12:00:00Z');
        self::assertSame(1, $select()['tags'][0]['count']);
        $this->clock->instant = new DateTimeImmutable('2026-11-13T12:00:01Z');
        self::assertSame(1, $select()['total']);
        file_put_contents($path, str_replace('draft: false', 'draft: true', file_get_contents($path)));
        self::assertSame([], $select()['tags']);
        self::assertSame([], $select()['years']);
        self::assertSame(0, $select()['total']);
        file_put_contents($path, str_replace(['draft: true', '2026-11-13'], ['draft: false', '2027-11-13'], file_get_contents($path)));
        self::assertSame(0, $select()['total']);
    }

    #[DataProvider('invalidListQueries')]
    public function testListInputHasExplicitStatusWithoutOverflow(string $path, array $query, int $status): void
    {
        try {
            $selection = BlogListQuery::parse($path, $query);
            $this->repository->listing($this->locales->default(), $this->repository->policy())->select($selection, $this->locales->default());
            self::fail('Invalid selection accepted');
        } catch (BlogListException $exception) {
            self::assertSame($status, $exception->status);
        }
    }

    public static function invalidListQueries(): array
    {
        return [
            ['', ['page' => '0'], 400], ['', ['page'                  => '-1'], 400], ['', ['page' => 'text'], 400],
            ['', ['page' => ['2']], 400], ['', ['year'                => ['2026']], 400], ['', ['page' => '1.5'], 400],
            ['', ['page' => str_repeat('9', 500)], 404], ['', ['page' => '2'], 404],
            ['archive/nope', [], 400], ['archive/0000', [], 400], ['archive/2026', [], 404],
            ['tags/unknown', [], 404], ['tags/php', ['year' => '20'], 400],
        ];
    }

    public function testLatestArticlesUsesOnlyFreshPublicSummariesAndValidatesLimit(): void
    {
        $this->article('ru/blog/future.mdx', 'future', '2026-11-13T12:00:00Z');
        $this->article('ru/blog/b.md', 'b', '2026-01-01');
        $this->article('ru/blog/a.md', 'a', '2026-01-01');
        $this->article('ru/blog/hidden.md', 'hidden', '2026-01-01', true);
        $latest = new LatestArticles($this->repository);
        $locale = $this->locales->default();
        self::assertSame([], $latest->props(null, $locale));
        self::assertSame(['a'], array_column($latest->props(['limit' => 1], $locale)['latestArticles']['items'], 'slug'));
        $this->clock->instant = new DateTimeImmutable('2026-11-13T12:00:00Z');
        $props                = $latest->props(['limit' => 2], $locale)['latestArticles'];
        self::assertTrue($props['enabled']);
        self::assertSame(['future', 'a'], array_column($props['items'], 'slug'));
        foreach ($props['items'] as $summary) {
            self::assertSame(['slug', 'title', 'description', 'date', 'tags', 'image', 'href', 'format', 'timezone'], array_keys($summary));
        }
        self::assertSame([], $latest->props(['limit' => 5], $this->locales->byCode('en'))['latestArticles']['items']);
        $this->clock->instant = new DateTimeImmutable('2026-11-13T12:00:01Z');
        self::assertSame(['future', 'a'], array_column($latest->props(['limit' => 2], $locale)['latestArticles']['items'], 'slug'));
        $this->article('ru/blog/future.mdx', 'future', '2026-11-13T12:00:00Z', true);
        self::assertSame(['a', 'b'], array_column($latest->props(['limit' => 2], $locale)['latestArticles']['items'], 'slug'));
        $this->article('ru/blog/future.mdx', 'future', '2027-11-13T12:00:00Z');
        self::assertSame(['a', 'b'], array_column($latest->props(['limit' => 2], $locale)['latestArticles']['items'], 'slug'));
        $this->put('site.json', '{"blog":{"enabled":false}}');
        self::assertSame(['enabled' => false, 'items' => []], $latest->props(['limit' => 2], $locale)['latestArticles']);
        $this->expectException(BlogException::class);
        $latest->props(['limit' => '2'], $locale);
    }

    #[DataProvider('invalidLatestConfig')]
    public function testLatestArticlesRejectsInvalidConfiguration(mixed $config): void
    {
        $this->expectException(BlogException::class);
        $this->expectExceptionMessage('page.latest_articles');
        new LatestArticles($this->repository)->props($config, $this->locales->default());
    }

    public static function invalidLatestConfig(): array
    {
        return [[true], [false], ['3'], [['limit' => 0]], [['limit' => -1]], [['limit' => 51]], [['limit' => 1.5]], [['limit' => true]], [['limit' => '3']]];
    }

    public function testRssIsValidXmlWithLocalizedAbsoluteUrlsStableGuidsAndNoMdxBody(): void
    {
        $this->put('ru/blog/xml.mdx', "---\ntitle: 'Юникод < & >'\ndescription: 'Summary <em> & \"quoted\"'\ndate: '2026-01-01'\n---\nimport missing from 'NEVER_EXECUTE'\nSECRET_BODY");
        $this->article('ru/blog/future.md', 'future', '2026-11-13T12:00:00Z');
        $this->article('ru/blog/hidden.md', 'hidden', '2026-01-01', true);
        $this->article('en/blog/english.md', 'english', '2026-01-01');
        $storage = new Storage(['default' => 'edoc_site', 'disks' => ['edoc_site' => ['driver' => 'local', 'rootPath' => $this->root]]]);

        $feed    = new BlogFeed($this->repository, new SeoMetaBuilder(), new SiteConfigRepository($storage, $this->locales));
        $request = new ServerRequest('GET', 'https://public.example/blog/rss.xml');

        $read = fn (): SimpleXMLElement => new SimpleXMLElement($feed->xml($request, $this->locales->default(), $this->repository->policy()));
        $xml  = $read();
        self::assertSame('2.0', (string) $xml['version']);
        self::assertSame('ru', (string) $xml->channel->language);
        self::assertCount(1, $xml->channel->item);
        self::assertSame('Юникод < & >', (string) $xml->channel->item->title);
        self::assertSame('Summary <em> & "quoted"', (string) $xml->channel->item->description);
        self::assertSame('https://public.example/blog/xml', (string) $xml->channel->item->link);
        self::assertSame((string) $xml->channel->item->link, (string) $xml->channel->item->guid);
        self::assertSame('true', (string) $xml->channel->item->guid['isPermaLink']);
        self::assertSame('Thu, 01 Jan 2026 00:00:00 +0000', (string) $xml->channel->item->pubDate);
        self::assertStringNotContainsString('SECRET_', $xml->asXML());
        self::assertStringNotContainsString('NEVER_EXECUTE', $xml->asXML());
        $guid = (string) $xml->channel->item->guid;
        foreach (['2026-11-13T12:00:00Z', '2026-11-13T12:00:01Z'] as $instant) {
            $this->clock->instant = new DateTimeImmutable($instant);
            self::assertCount(2, $read()->channel->item);
        }
        $this->article('ru/blog/future.md', 'future', '2026-11-13T12:00:00Z', true);
        self::assertCount(1, $read()->channel->item);
        self::assertSame($guid, (string) $read()->channel->item->guid);
        $this->article('ru/blog/future.md', 'future', '2027-11-13T12:00:00Z');
        self::assertCount(1, $read()->channel->item);
        $english = new SimpleXMLElement($feed->xml($request, $this->locales->byCode('en'), $this->repository->policy()));

        self::assertSame('en', (string) $english->channel->language);
        self::assertSame('https://public.example/en/blog/english', (string) $english->channel->item->guid);
        $path = $this->root . '/ru/blog/xml.mdx';
        file_put_contents($path, str_replace("date: '2026-01-01'", "date: '2026-02-01'", file_get_contents($path)));
        self::assertSame($guid, (string) $read()->channel->item->guid);
        self::assertSame('Sun, 01 Feb 2026 00:00:00 +0000', (string) $read()->channel->item->pubDate);

    }

    public function testMp4RangesRemainBehindPublicationAndBuildGuards(): void
    {
        $this->article('ru/blog/clip.mdx', 'clip', '2026-11-13T12:00:00Z');
        $record     = $this->repository->records($this->locales->default())['clip'];
        $generation = str_repeat('a', 32);
        $abi        = str_repeat('b', 64);
        $files      = ['clip.mp4' => ['mime' => 'video/mp4', 'size' => 10, 'hash' => hash('sha256', '0123456789')]];
        $entry      = ['source' => $record['source'], 'slug' => 'clip', 'locale' => 'ru', 'prefix' => '/blog/_modules',
            'bodyDigest'        => $record['bodyDigest'], 'inputs' => [], 'files' => $files, 'entry' => null, 'css' => [], 'attachments' => ['clip.mp4']];
        $active = ['schema' => 1, 'site' => $this->repository->siteId(), 'abi' => $abi, 'generation' => $generation, 'articles' => [$record['key'] => $entry]];
        $this->put('build/active.json', json_encode($active, JSON_THROW_ON_ERROR));
        $this->put('public/build/blog-runtime.json', json_encode(['abi' => $abi], JSON_THROW_ON_ERROR));
        $output = 'build/' . $generation . '/' . $record['key'] . '/clip.mp4';
        $this->put($output, '0123456789');
        $middleware = new BlogModulesMiddleware($this->repository, new BlogBuild($this->repository, $this->root, $this->root . '/build'));
        $handler    = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return new ResponseFactory()->createResponse(418);
            }
        };
        $url  = 'https://example.test/blog/_modules/' . $generation . '/' . $record['key'] . '/clip.mp4';
        $call = static function (string $range, string $method = 'GET', bool $ifRange = false) use ($middleware, $handler, $url): ResponseInterface {
            $request = new ServerRequest($method, $url)->withHeader('Range', $range)->withHeader('If-None-Match', '*');

            if ($ifRange) {
                $request = $request->withHeader('If-Range', 'old');
            }

            return $middleware->process($request, $handler);
        };
        self::assertSame(404, $call('bytes=0-1')->getStatusCode());
        $this->clock->instant = new DateTimeImmutable('2026-11-13T12:00:00Z');
        foreach ([['bytes=0-1', '01', 'bytes 0-1/10'], ['bytes=5-', '56789', 'bytes 5-9/10'], ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=8-99999999999999999999', '89', 'bytes 8-9/10'], ['bytes=-99999999999999999999', '0123456789', 'bytes 0-9/10']] as [$range, $body, $contentRange]) {
            $response = $call($range);
            self::assertSame(206, $response->getStatusCode());
            self::assertSame($body, (string) $response->getBody());
            self::assertSame((string) strlen($body), $response->getHeaderLine('Content-Length'));
            self::assertSame($contentRange, $response->getHeaderLine('Content-Range'));
            self::assertSame('bytes', $response->getHeaderLine('Accept-Ranges'));
            self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
            self::assertSame('', $response->getHeaderLine('ETag'));
        }
        foreach (['bytes=10-', 'bytes=-0', 'bytes=8-3', 'bytes=99999999999999999999-'] as $range) {
            $response = $call($range);
            self::assertSame(416, $response->getStatusCode());
            self::assertSame('bytes */10', $response->getHeaderLine('Content-Range'));
            self::assertSame('', (string) $response->getBody());
        }
        foreach (['bytes=0-1,4-5', 'bad', 'bytes=-', 'items=0-1', 'bytes=' . str_repeat('9', 200) . '-'] as $range) {
            self::assertSame(200, $call($range)->getStatusCode());
            self::assertSame('0123456789', (string) $call($range)->getBody());
        }
        self::assertSame(200, $call('bytes=0-1', 'GET', true)->getStatusCode());
        $head = $call('bytes=0-1', 'HEAD');
        self::assertSame(200, $head->getStatusCode());
        self::assertSame('10', $head->getHeaderLine('Content-Length'));
        self::assertSame('', (string) $head->getBody());
        $this->article('ru/blog/clip.mdx', 'clip', '2026-11-13T12:00:00Z', true);
        foreach (['GET', 'HEAD'] as $method) {
            $denied = $call('bytes=0-1', $method);
            self::assertSame(404, $denied->getStatusCode());
            self::assertSame('', $denied->getHeaderLine('Content-Range'));
            self::assertSame('none', $denied->getHeaderLine('Accept-Ranges'));
        }
        $this->article('ru/blog/clip.mdx', 'clip', '2026-11-13T12:00:00Z');
        $this->put($output, 'BROKEN');
        self::assertSame(404, $call('bytes=0-1')->getStatusCode());
    }

    public function testPrivatePreviewSummaryUsesOnlyValidatedGuardedOutput(): void
    {
        $this->article('ru/blog/photo.mdx', 'photo', '2026-01-01');
        $source = file_get_contents($this->root . '/ru/blog/photo.mdx');
        $this->put('ru/blog/photo.mdx', str_replace('draft: false', "draft: false\npreview: photo/cover.png", $source));
        $record = $this->repository->records($this->locales->default())['photo'];
        self::assertSame('ru/blog/photo/cover.png', $record['preview']);
        self::assertNull($record['image']);
        self::assertArrayNotHasKey('preview', $this->repository->summary($record), 'Raw sidecar paths must never enter public props');
        $build = new BlogBuild($this->repository, $this->root, $this->root . '/build');

        self::assertNull($build->summary($record)['preview'], 'Unbuilt preview does not break listing');
        $bytes = 'ORIGINAL_PHOTO';
        $this->put($record['preview'], $bytes);
        $generation = str_repeat('a', 32);
        $abi        = str_repeat('b', 64);
        $file       = 'assets/cover.png';
        $entry      = ['source' => $record['source'], 'slug' => 'photo', 'locale' => 'ru', 'prefix' => '/blog/_modules',
            'bodyDigest'        => $record['bodyDigest'], 'inputs' => ['site:' . $record['preview'] => hash('sha256', $bytes)],
            'files'             => [$file => ['mime' => 'image/png', 'size' => strlen($bytes), 'hash' => hash('sha256', $bytes)]],
            'entry'             => null, 'css' => [], 'attachments' => [], 'previewSource' => $record['preview'], 'preview' => $file];
        $active = ['schema' => 1, 'site' => $this->repository->siteId(), 'abi' => $abi, 'generation' => $generation, 'articles' => [$record['key'] => $entry]];
        $save   = function (array $value): void {
            $this->put('build/active.json', json_encode($value, JSON_THROW_ON_ERROR));
        };
        $save($active);
        $this->put('public/build/blog-runtime.json', json_encode(['abi' => $abi], JSON_THROW_ON_ERROR));
        $output = 'build/' . $generation . '/' . $record['key'] . '/' . $file;
        $this->put($output, $bytes);
        $url = '/blog/_modules/' . $generation . '/' . $record['key'] . '/' . $file;
        self::assertSame($url, $build->summary($record)['preview']);
        self::assertSame($bytes, $build->output($record, $generation, $file)['bytes']);
        $latest = new LatestArticles($this->repository, $build);

        self::assertSame($url, $latest->props(['limit' => 2], $this->locales->default())['latestArticles']['items'][0]['preview']);
        // Identity, type, generation, namespace and digest errors close the preview only.
        foreach (['site', 'abi', 'previewSource', 'preview', 'mime', 'locale', 'prefix', 'bodyDigest'] as $field) {
            $bad = $active;
            if ($field === 'site' || $field === 'abi') {
                $bad[$field] = 'bad';
            } elseif ($field === 'mime') {
                $bad['articles'][$record['key']]['files'][$file]['mime'] = 'text/javascript';
            } else {
                $bad['articles'][$record['key']][$field] = 'bad';
            }
            $save($bad);
            self::assertNull($build->summary($record)['preview'], $field);
        }
        $save($active);
        $this->put($output, 'CORRUPT');
        self::assertNull($build->summary($record)['preview']);
        $this->put($output, $bytes);
        unlink($this->root . '/' . $record['preview']);
        self::assertNull($build->summary($record)['preview'], 'Missing original is unavailable');
        $this->put('outside.png', $bytes);
        symlink($this->root . '/outside.png', $this->root . '/' . $record['preview']);
        self::assertNull($build->summary($this->repository->records($this->locales->default())['photo'])['preview'], 'Symlink is unavailable without breaking the list');
        unlink($this->root . '/' . $record['preview']);
        $this->put($record['preview'], $bytes);
        foreach ([true, false] as $draft) {
            // Use a fresh record so no cached visibility decision survives metadata edits.
            $hiddenSource = str_replace('draft: false', "draft: false\npreview: photo/cover.png", $source);
            $hiddenSource = $draft ? str_replace('draft: false', 'draft: true', $hiddenSource)
                : str_replace("date: '2026-01-01'", "date: '2099-01-01'", $hiddenSource);
            $this->put('ru/blog/photo.mdx', $hiddenSource);
            $hidden = $this->repository->records($this->locales->default())['photo'];
            self::assertNull($build->summary($hidden)['preview']);
        }
    }

    #[DataProvider('invalidPreviewPaths')]
    public function testPreviewCannotPointOutsideItsRasterSidecar(mixed $preview): void
    {
        $this->article('ru/blog/photo.mdx', 'photo', '2026-01-01');
        $source = file_get_contents($this->root . '/ru/blog/photo.mdx');
        $this->put('ru/blog/photo.mdx', str_replace('draft: false', 'draft: false' . "\npreview: " . json_encode($preview), $source));
        $this->expectException(BlogException::class);
        $this->expectExceptionMessage('preview');
        $this->repository->records($this->locales->default());
    }

    public static function invalidPreviewPaths(): array
    {
        return [[true], [12], ['../secret.png'], ['/etc/secret.png'], ['other/cover.png'], ['photo/../secret.png'],
            ['photo/cover.svg'], ['photo/video.mp4'], ['https://example.test/cover.png'], ['photo/a%2epng'], ['photo/a.png?x']];
    }

    private function article(string $path, string $slug, string $date, bool $draft = false): void
    {
        $this->put($path, "---\ntitle: Article\ndescription: Description\nslug: " . $slug . "\ndate: '" . $date . "'\ndraft: " . ($draft ? 'true' : 'false') . "\n---\nBODY");
    }

    private function put(string $path, string $text): void
    {
        if (!is_dir(dirname($this->root . '/' . $path))) {
            mkdir(dirname($this->root . '/' . $path), 0775, true);
        }
        file_put_contents($this->root . '/' . $path, $text);
    }
}
