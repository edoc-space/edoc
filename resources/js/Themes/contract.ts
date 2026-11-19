import type { BlogListProps } from '../Pages/Web/Blog/List';
import type { BlogArticleProps } from '../Pages/Web/Blog/Article';
import type React from 'react';
import type { PageProps } from '../Pages/Web/Page/Show';
import type { DocumentationProps } from '../Pages/Web/Documentation/Show';
import type { ErrorProps } from '../Pages/Web/Error/Show';
import type { SiteHeaderProps, SiteFooterProps } from '../Layouts/SiteLayout';

export type { BlogListProps, BlogArticleProps, PageProps, DocumentationProps, ErrorProps, SiteHeaderProps, SiteFooterProps };
export type SiteShellProps = React.HTMLAttributes<HTMLDivElement> & {
  kind: 'page' | 'documentation' | 'error' | 'blog-list' | 'blog-article';
  children: React.ReactNode;
};

/** Version 1: omitted slots use the engine's default. Data and URLs belong to the engine. */
export interface ThemeSlots {
  SiteShell: React.ComponentType<SiteShellProps>;
  Header: React.ComponentType<SiteHeaderProps>;
  Footer: React.ComponentType<SiteFooterProps>;
  Page: React.ComponentType<PageProps>;
  Documentation: React.ComponentType<DocumentationProps>;
  Error: React.ComponentType<ErrorProps>;
  BlogList: React.ComponentType<BlogListProps>;
  BlogArticle: React.ComponentType<BlogArticleProps>;
}

export type SiteTheme = { contractVersion: 1; slots?: Partial<ThemeSlots> };
