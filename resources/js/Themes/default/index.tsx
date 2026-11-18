import BlogList from '../../Pages/Web/Blog/List';
import BlogArticle from '../../Pages/Web/Blog/Article';
import React from 'react';
import { SiteHeader, SiteFooter } from '../../Layouts/SiteLayout';
import Page from '../../Pages/Web/Page/Show';
import Documentation from '../../Pages/Web/Documentation/Show';
import ErrorPage from '../../Pages/Web/Error/Show';
import type { SiteShellProps, ThemeSlots, SiteTheme } from '../contract';

export function SiteShell({ kind, children, ...attributes }: SiteShellProps) {
  return <div {...attributes}>{children}</div>;
}

export const defaultSlots: ThemeSlots = {
  SiteShell, Header: SiteHeader, Footer: SiteFooter, Page, Documentation, Error: ErrorPage, BlogList, BlogArticle,
};

export default { contractVersion: 1 } satisfies SiteTheme;
