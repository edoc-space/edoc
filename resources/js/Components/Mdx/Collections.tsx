import React from 'react';
import { Badge } from '@phpsoftbox/react-softbox';
import { Card } from './ContentBlocks';
import { Grid } from './Layout';
import { MdxLayoutContext } from './context';
import type { BlogSummary } from '../../Pages/Web/Blog/List';

export type PublicArticles = { enabled: boolean; items: BlogSummary[] };

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="collection-empty" role="status"><strong>{title}</strong>{children}</div>;
}

export function TagList({ tags }: { tags: string[] }) {
  return <span className="collection-tags">{tags.map(tag => <Badge key={tag} shape="pill">{tag}</Badge>)}</span>;
}

export function ArticleCard({ article, locale = 'en' }: { article: BlogSummary; locale?: string }) {
  const image = article.preview ?? article.image;
  return <Card title={article.title} href={article.href} linkPlacement="card" headingLevel={2} className="blog-card"
    metadata={<><time dateTime={article.date}>{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: article.timezone }).format(new Date(article.date))}</time><TagList tags={article.tags} /></>}
    media={image ? <img src={image} alt="" loading="lazy" /> : null}>
    <p className="blog-card__description">{article.description}</p>
  </Card>;
}

/** Request-time public summaries supplied only by an explicitly opted-in page. */
export function LatestArticles({ title }: { title?: string }) {
  const { latestArticles, locale } = React.useContext(MdxLayoutContext);
  const ru = locale?.code !== 'en';
  return <section className="latest-articles" aria-label={title ?? (ru ? 'Последние статьи' : 'Latest articles')}>
    <div className="latest-articles__heading">
      <h2>{title ?? (ru ? 'Последние статьи' : 'Latest articles')}</h2>
      {latestArticles?.enabled ? <a href={`${locale?.url_prefix ?? ''}/blog`}>{ru ? 'Посмотреть все' : 'View all'}</a> : null}
    </div>
    {!latestArticles?.enabled ? <EmptyState title={ru ? 'Подборка статей отключена.' : 'Article selection is disabled.'} />
      : latestArticles.items.length === 0 ? <EmptyState title={ru ? 'Публикаций пока нет.' : 'No articles yet.'} />
      : <Grid columns={2}>{latestArticles.items.map(article => <ArticleCard key={article.href} article={article} locale={locale?.code} />)}</Grid>}
  </section>;
}
