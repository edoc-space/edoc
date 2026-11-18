import React from 'react';
import { Link } from '@inertiajs/react';
import { SiteShell, SiteHeader, SiteFooter } from '../../../Themes/components';
import { MarkdownDocument } from '../../../Components/MarkdownDocument';
import { MdxDocument } from '../../../Components/MdxDocument';
import type { PrivateMdxDescriptor } from '../../../Components/MdxDocument';
import { usePageScrollRestoration } from '../../../Components/usePageScrollRestoration';
import { mergeLocaleAlternates } from '../../../Layouts/SiteLayout';
import type { BlogListProps, BlogSummary } from './List';
import { formatBlogDate } from './List';

export type BlogArticleProps = Pick<BlogListProps, 'title' | 'web' | 'meta'> & {
  blog: { href: string; feedUrl?: string; article: BlogSummary; document: {
    format: 'markdown' | 'mdx'; html: string; toc: { id: string; title: string; level: number }[];
    descriptor: PrivateMdxDescriptor;
  } };
};
export default function BlogArticle({ blog, web, meta }: BlogArticleProps) {
  const navigation = web?.navigation ?? [];
  const article = blog.article;
  usePageScrollRestoration(`blog.${article.href}`);
  return (
    <SiteShell kind="blog-article" className="page-shell blog-shell">
      <SiteHeader className="page-header" navClassName="page-header-nav" navigation={navigation} site={web?.site}
        locales={mergeLocaleAlternates(web?.locales, meta?.alternates)} ui={web?.ui} activeHref={blog.href} />
      <main className="blog-layout">
        <Link className="blog-back" href={blog.href} prefetch={false}>{web?.locale?.code === 'ru' ? '← Блог' : '← Blog'}</Link>
        {blog.feedUrl ? <a className="blog-rss" href={blog.feedUrl}>RSS ↗</a> : null}
        <header className="blog-article-heading">
          <time dateTime={article.date}>{formatBlogDate(article.date, web?.locale?.code, article.timezone)}</time>
          <h1>{article.title}</h1><p>{article.description}</p>
        </header>
        {blog.document.toc.length ? <nav className="blog-toc" aria-label={web?.locale?.code === 'ru' ? 'Оглавление' : 'Contents'}>
          {blog.document.toc.map((item) => <a key={item.id} href={`#${item.id}`}>{item.title}</a>)}
        </nav> : null}
        {blog.document.format === 'mdx' && blog.document.descriptor.entry ? (
          <MdxDocument key={article.href} className="blog-document markdown-body" module={blog.document.descriptor.entry}
            privateRuntime={blog.document.descriptor} locale={web?.locale} ui={web?.ui} />
        ) : <MarkdownDocument className="blog-document markdown-body" html={blog.document.html} />}
      </main>
      <SiteFooter navigation={navigation} site={web?.site} footer={web?.footer} ui={web?.ui} />
    </SiteShell>
  );
}
