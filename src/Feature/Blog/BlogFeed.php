<?php

declare(strict_types=1);

namespace App\Feature\Blog;

use App\Feature\Site\SeoMetaBuilder;
use App\Feature\Site\SiteConfigRepository;
use App\Feature\Site\SiteLocale;
use Psr\Http\Message\ServerRequestInterface;
use XMLWriter;

/** RSS contains summaries only: no rendering, body import or build descriptor. */
final readonly class BlogFeed
{
    public function __construct(
        private BlogRepository $repository,
        private SeoMetaBuilder $seo,
        private SiteConfigRepository $sites,
    ) {
    }

    public function xml(ServerRequestInterface $request, SiteLocale $locale, PublicationPolicy $policy): string
    {
        $site = $this->sites->sharedData([], [], $locale)['site'];
        $xml  = new XMLWriter();

        $xml->openMemory();
        $xml->startDocument('1.0', 'UTF-8');
        $xml->startElement('rss');
        $xml->writeAttribute('version', '2.0');
        $xml->startElement('channel');
        $xml->writeElement('title', $site['title'] . ($locale->code === 'ru' ? ' · Блог' : ' · Blog'));
        $xml->writeElement('link', $this->seo->absoluteUrl($request, $locale->url('/blog')));
        $xml->writeElement('description', $site['description']);
        $xml->writeElement('language', $locale->code);
        foreach ($this->repository->publicRecords($locale, $policy) as $article) {
            $url = $this->seo->absoluteUrl($request, $article['href']);
            $xml->startElement('item');
            $xml->writeElement('title', $article['title']);
            $xml->writeElement('link', $url);
            $xml->startElement('guid');
            $xml->writeAttribute('isPermaLink', 'true');
            $xml->text($url);
            $xml->endElement();
            $xml->writeElement('pubDate', $article['date']->format('D, d M Y H:i:s O'));
            $xml->writeElement('description', $article['description']);
            $xml->endElement();
        }
        $xml->endElement();
        $xml->endElement();
        $xml->endDocument();

        return $xml->outputMemory();
    }
}
