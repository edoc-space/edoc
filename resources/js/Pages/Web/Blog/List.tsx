import React from 'react';
import { Link } from '@inertiajs/react';
import { SiteShell, SiteHeader, SiteFooter } from '../../../Themes/components';
import type { PageProps } from '../Page/Show';
import { Grid } from '../../../Components/Mdx/Layout';
import { Filters } from '../../../Components/Mdx/Filters';
import { ArticleCard, EmptyState } from '../../../Components/Mdx/Collections';
import { mergeLocaleAlternates } from '../../../Layouts/SiteLayout';

export type BlogSummary = {
  slug: string; timezone: string; title: string; description: string; date: string;
  tags: string[]; preview?: string | null; image: string | null; href: string; format: 'markdown' | 'mdx';
};
export type BlogListProps = Pick<PageProps, 'web' | 'meta'> & {
  title: string;
  blog: {
    href: string; feedUrl?: string; canonical: string; articles: BlogSummary[]; total: number;
    filters: { tag: string | null; year: number | null };
    tags: { value: string; count: number; href: string }[];
    years: { value: number; count: number; href: string }[];
    clearTag: string; clearYear: string;
    pagination: {
      page: number; pages: number; pageSize: number;
      previous: string | null; next: string | null; first: string; last: string;
      links: { page: number; href: string }[];
    };
  };
};
export default function BlogList({ title, blog, web, meta }: BlogListProps) {
  const navigation = web?.navigation ?? [];
  const ru = web?.locale?.code === 'ru';
  const { pagination, filters } = blog;
  return (
    <SiteShell kind="blog-list" className="page-shell blog-shell">
      <SiteHeader className="page-header" navClassName="page-header-nav" navigation={navigation} site={web?.site}
        locales={mergeLocaleAlternates(web?.locales, meta?.alternates)} ui={web?.ui} activeHref={blog.href} />
      <main className="blog-layout">
        <div className="blog-title-row"><h1>{title}</h1>{blog.feedUrl ? <a className="blog-rss" href={blog.feedUrl}>RSS ↗</a> : null}</div>
        <div className="blog-filters">
          <Filters mode="navigation" label={ru ? 'Тег' : 'Tag'} value={filters.tag ?? ''}
            options={[{ value: '', label: ru ? 'Все теги' : 'All tags', href: blog.clearTag },
              ...blog.tags.map(tag => ({ ...tag, label: tag.value }))]} />
          <Filters mode="navigation" label={ru ? 'Год' : 'Year'} value={filters.year?.toString() ?? ''}
            options={[{ value: '', label: ru ? 'Все годы' : 'All years', href: blog.clearYear },
              ...blog.years.map(year => ({ ...year, value: String(year.value), label: String(year.value) }))]} />
        </div>
        <p className="blog-results" role="status">
          {ru ? `Публикаций: ${blog.total}. Страница ${pagination.page} из ${pagination.pages}.`
            : `Articles: ${blog.total}. Page ${pagination.page} of ${pagination.pages}.`}
        </p>
        <Grid columns={1} className="blog-list">
          {blog.articles.map(article => <ArticleCard key={article.href} article={article} locale={web?.locale?.code} />)}
          {blog.articles.length === 0 ? <EmptyState title={filters.tag !== null || filters.year !== null
            ? (ru ? 'По выбранным условиям публикаций нет.' : 'No articles match these filters.')
            : (ru ? 'Публикаций пока нет.' : 'No articles yet.')} /> : null}
        </Grid>
        {pagination.pages > 1 ? <nav className="blog-pagination" aria-label={ru ? 'Страницы блога' : 'Blog pages'}>
          {pagination.previous ? <Link href={pagination.previous} rel="prev" prefetch={false}>{ru ? 'Назад' : 'Previous'}</Link> : null}
          {pagination.links[0]?.page > 1 ? <Link href={pagination.first} prefetch={false}>1</Link> : null}
          {pagination.links[0]?.page > 2 ? <span aria-hidden="true">…</span> : null}
          {pagination.links.map((link) => <Link key={link.page} href={link.href} prefetch={false}
            aria-label={ru ? `Страница ${link.page}` : `Page ${link.page}`}
            aria-current={link.page === pagination.page ? 'page' : undefined}>{link.page}</Link>)}
          {pagination.links.at(-1)!.page < pagination.pages - 1 ? <span aria-hidden="true">…</span> : null}
          {pagination.links.at(-1)!.page < pagination.pages ? <Link href={pagination.last} prefetch={false}>{pagination.pages}</Link> : null}
          {pagination.next ? <Link href={pagination.next} rel="next" prefetch={false}>{ru ? 'Далее' : 'Next'}</Link> : null}
        </nav> : null}
      </main>
      <SiteFooter navigation={navigation} site={web?.site} footer={web?.footer} ui={web?.ui} />
    </SiteShell>
  );
}
export function formatBlogDate(date: string, locale = 'en', timeZone = 'UTC') {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(new Date(date));
}
