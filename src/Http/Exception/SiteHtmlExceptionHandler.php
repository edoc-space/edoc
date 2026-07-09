<?php

declare(strict_types=1);

namespace App\Http\Exception;

use App\Feature\Site\SiteLocale;
use App\Feature\Site\SiteLocaleResolver;
use PhpSoftBox\Application\ErrorHandler\AbstractExceptionHandler;
use PhpSoftBox\ErrorFormatter\ThrowableFormatter;
use PhpSoftBox\Inertia\Inertia;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Throwable;

use function is_array;
use function stripos;

final class SiteHtmlExceptionHandler extends AbstractExceptionHandler
{
    public function __construct(
        private readonly Inertia $inertia,
        private readonly ?SiteLocaleResolver $locales = null,
        bool $includeDetails = false,
    ) {
        parent::__construct($includeDetails);
    }

    public function handle(Throwable $exception, ServerRequestInterface $request): ResponseInterface
    {
        ['status' => $status, 'headers' => $headers] = $this->resolveStatusAndHeaders($exception);

        $locale                    = $this->resolveLocale($request);
        [$title, $message, $image] = $this->content($exception, $status, $locale?->code);

        $this->inertia->setRequest($request);
        $response = $this->inertia
            ->render('Web/Error/Show', [
                'title' => $title,
                'error' => [
                    'status'  => $status,
                    'title'   => $title,
                    'message' => $message,
                    'image'   => $image,
                    'details' => $this->details($exception, $status),
                ],
                'request' => [
                    'href' => $this->requestHref($request),
                ],
                'meta' => [
                    'title'       => $title,
                    'description' => $message,
                    'language'    => $locale?->code ?? 'ru',
                ],
            ])
            ->withStatus($status);

        foreach ($headers as $name => $value) {
            $response = $response->withHeader($name, is_array($value) ? $value : (string) $value);
        }

        return $this->withVaryHeader($response);
    }

    private function resolveLocale(ServerRequestInterface $request): ?SiteLocale
    {
        if ($this->locales === null) {
            return null;
        }

        return $this->locales->fromRequest($request) ?? $this->locales->default();
    }

    /**
     * @return array{string,string,string}
     */
    private function content(Throwable $exception, int $status, ?string $localeCode): array
    {
        $isEnglish = $localeCode === 'en';

        if ($status === 404) {
            return $isEnglish
                ? ['Page not found', 'This page does not exist or the link is outdated.', '/images/404.png']
                : ['Страница не найдена', 'Такой страницы нет или ссылка устарела.', '/images/404.png'];
        }

        if ($status >= 500) {
            return $isEnglish
                ? ['Something went wrong', 'Try refreshing the page later.', '/images/500.png']
                : ['Что-то пошло не так', 'Попробуйте обновить страницу позже.', '/images/500.png'];
        }

        return [
            $this->resolveTitle($exception, $status),
            $this->resolveMessage($exception, $status),
            '/images/500.png',
        ];
    }

    private function details(Throwable $exception, int $status): ?array
    {
        if (!$this->includeDetails || $status === 404) {
            return null;
        }

        return [
            'location' => ThrowableFormatter::toLocation($exception),
            'trace'    => ThrowableFormatter::toTrace($exception),
        ];
    }

    private function requestHref(ServerRequestInterface $request): string
    {
        $uri  = $request->getUri();
        $href = $uri->getPath();
        if ($uri->getQuery() !== '') {
            $href .= '?' . $uri->getQuery();
        }

        return $href === '' ? '/' : $href;
    }

    private function withVaryHeader(ResponseInterface $response): ResponseInterface
    {
        $vary = $response->getHeaderLine('Vary');
        if ($vary === '') {
            return $response->withHeader('Vary', 'X-Inertia');
        }

        if (stripos($vary, 'X-Inertia') !== false) {
            return $response;
        }

        return $response->withHeader('Vary', $vary . ', X-Inertia');
    }
}
