<?php

declare(strict_types=1);

namespace App\Http\Action\Web\Blog;

use App\Feature\Blog\BlogBuild;
use App\Feature\Blog\BlogException;
use App\Feature\Blog\BlogFeed;
use App\Feature\Blog\BlogListException;
use App\Feature\Blog\BlogListQuery;
use App\Feature\Blog\BlogMarkdownLinkResolver;
use App\Feature\Blog\BlogRepository;
use App\Feature\Content\ContentRendererInterface;
use App\Feature\Content\ContentRenderOptions;
use App\Feature\Content\MdxTableOfContents;
use App\Feature\Page\PageException;
use App\Feature\Site\SeoMetaBuilder;
use App\Feature\Site\SiteLocaleResolver;
use App\Http\Exception\SiteHtmlExceptionHandler;
use PhpSoftBox\Http\Message\ResponseFactory;
use PhpSoftBox\Http\Message\StreamFactory;
use PhpSoftBox\Inertia\Inertia;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

use function array_map;
use function error_log;
use function explode;
use function in_array;
use function trim;

final readonly class ShowBlogAction
{
    public function __construct(
        private BlogRepository $repository,
        private BlogBuild $build,
        private SiteLocaleResolver $locales,
        private ContentRendererInterface $renderer,
        private Inertia $inertia,
        private SeoMetaBuilder $seo,
        private SiteHtmlExceptionHandler $errors,
        private BlogFeed $feed,
    ) {
    }

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $locale = $this->locales->fromRequest($request);
        $params = $request->getAttribute('_route_params', []);
        $slug   = trim((string) ($params['path'] ?? ''), '/');
        try {
            $policy = $this->repository->policy();
            if (!$policy->enabled || $locale === null) {
                return $this->error($request, 404);
            }
            if ($slug === 'rss.xml') {
                return $this->headers($request, new ResponseFactory()->createResponse()
                    ->withHeader('Content-Type', 'application/rss+xml; charset=UTF-8')
                    ->withHeader('X-Content-Type-Options', 'nosniff')
                    ->withBody(new StreamFactory()->createStream($this->feed->xml($request, $locale, $policy))));
            }
            $feedUrl = $locale->url('/blog/rss.xml');
            if ($slug === '' || in_array(explode('/', $slug)[0], ['tags', 'archive'], true)) {
                $query   = BlogListQuery::parse($slug, $request->getQueryParams());
                $listing = $this->repository->listing($locale, $policy)->select($query, $locale);
                $title   = $locale->code === 'ru' ? 'Блог' : 'Blog';
                if ($query->tag !== null) {
                    $title .= ' · ' . $query->tag;
                }
                if ($query->year !== null) {
                    $title .= ' · ' . $query->year;
                }
                if ($query->page > 1) {
                    $title .= ($locale->code === 'ru' ? ' · Страница ' : ' · Page ') . $query->page;
                }
                $alternates = [];
                foreach ($this->repository->locales() as $otherLocale) {
                    try {
                        if ($otherLocale->code !== $locale->code) {
                            $this->repository->listing($otherLocale, $policy)->select($query, $otherLocale);
                        }
                        $alternates[] = ['locale' => $otherLocale->code, 'href' => $query->href($otherLocale)];
                    } catch (BlogListException) {
                        // This selection/page has no public counterpart in this locale.
                    }
                }
                $listing['feedUrl']  = $feedUrl;
                $image               = $listing['articles'][0]['image'] ?? null;
                $listing['articles'] = array_map($this->build->summary(...), $listing['articles']);
                $response            = $this->inertia->render('Web/Blog/List', [
                    'title' => $title, 'blog' => $listing,
                    'meta'  => [
                        'title'       => $title,
                        'description' => $title . ($locale->code === 'ru' ? '. Публикаций: ' : '. Articles: ') . $listing['total'] . '.',
                        'language'    => $locale->code, 'og_type' => 'website',
                        'rss'         => $this->seo->absoluteUrl($request, $feedUrl),
                        'robots'      => $query->tag !== null && $query->year !== null ? 'noindex,follow' : null,
                        'image'       => $image === null ? null : $this->seo->absoluteUrl($request, $image),
                        ...$this->seo->links($request, $listing['canonical'], $alternates),
                    ],
                ]);

                return $this->headers($request, $response);
            }
            $records = $this->repository->publicRecords($locale, $policy);
            $article = null;
            foreach ($records as $record) {
                if ($record['slug'] === $slug) {
                    $article = $record;
                    break;
                }
            }
            if ($article === null) {
                return $this->error($request, 404);
            }
            try {
                $descriptor = $this->build->descriptor($article);
            } catch (BlogException $exception) {
                if ($article['format'] === 'mdx') {
                    throw $exception;
                }
                // Ordinary Markdown with public static needs no compiled body.
                // A private attachment still fails in the resolver without a
                // current allowlisted descriptor.
                $descriptor = ['abi' => '', 'entry' => null, 'css' => [], 'assets' => []];
            }
            $document = ['format' => $article['format'], 'html' => '', 'toc' => $article['format'] === 'mdx' ? new MdxTableOfContents()->extract($article['body']) : [], 'descriptor' => $descriptor];
            if ($article['format'] === 'markdown') {
                $rendered = $this->renderer->render($article['body'], new ContentRenderOptions(
                    path: $article['source'],
                    linkResolver: new BlogMarkdownLinkResolver($locale, $article['source'], $this->repository->articleLinks($locale), $descriptor['assets']),
                    tocMinHeadingLevel: 2,
                    tocMaxHeadingLevel: 3,
                ));
                $document['html'] = $rendered->html;
                $document['toc']  = $rendered->toc;
            }

            return $this->headers($request, $this->inertia->render('Web/Blog/Article', [
                'title' => $article['title'],
                'blog'  => ['href' => $locale->url('/blog'), 'feedUrl' => $feedUrl, 'article' => $this->build->summary($article), 'document' => $document],
                'meta'  => ['title' => $article['title'], 'description' => $article['description'], 'language' => $locale->code,
                    'rss'           => $this->seo->absoluteUrl($request, $feedUrl),
                    'og_type'       => 'article', 'published_time' => $article['date']->format('c'),
                    'image'         => $article['image'] === null ? null : $this->seo->absoluteUrl($request, $article['image']),
                    ...$this->seo->links($request, $article['href'], $this->repository->alternates($article, $policy))],
            ]));
        } catch (BlogListException $exception) {
            return $this->error($request, $exception->status);
        } catch (BlogException $exception) {
            error_log($exception->getMessage());

            return $this->error($request, 503);
        }
    }

    private function error(ServerRequestInterface $request, int $status): ResponseInterface
    {
        if ($status === 404) {
            return $this->headers($request, $this->errors->handle(PageException::notFound(), $request));
        }
        $locale = $this->locales->fromRequest($request);
        $title  = $status === 400
            ? ($locale?->code === 'ru' ? 'Некорректный отбор' : 'Invalid selection')
            : ($locale?->code === 'ru' ? 'Требуется сборка блога' : 'Blog build required');
        $message = $status === 400
            ? ($locale?->code === 'ru' ? 'Укажите положительный целый номер страницы и год из четырёх цифр.' : 'Use a positive integer page number and a four-digit year.')
            : ($locale?->code === 'ru' ? 'Проверьте статьи и выполните production-сборку сайта.' : 'Validate blog content and rebuild this site.');

        return $this->headers($request, $this->inertia->render('Web/Error/Show', [
            'title' => $title,
            'error' => ['status' => $status, 'title' => $title, 'message' => $message],
            'meta'  => ['title' => $title, 'description' => $message, 'language' => $locale?->code ?? 'ru'],
        ])->withStatus($status));
    }

    private function headers(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $response = $response->withHeader('Cache-Control', 'no-store')->withoutHeader('ETag')->withoutHeader('Last-Modified');

        return $request->getMethod() === 'HEAD'
            ? $response->withBody(new StreamFactory()->createStream('')) : $response;
    }
}
