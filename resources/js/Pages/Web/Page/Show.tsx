import React from 'react';
import { MarkdownDocument } from '../../../Components/MarkdownDocument';
import { MdxDocument } from '../../../Components/MdxDocument';
import { usePageScrollRestoration } from '../../../Components/usePageScrollRestoration';
import {
  mergeLocaleAlternates,
  SiteAlternateLink,
  SiteFooter,
  SiteFooterData,
  SiteHeader,
  SiteInfo,
  SiteLocaleItem,
  SiteUiText,
} from '../../../Layouts/SiteLayout';

type NavigationItem = {
  title?: string;
  label?: string;
  href: string;
};

type Diagnostic = {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  path?: string;
  line?: number | null;
};

type Props = {
  title: string;
  app?: {
    env?: string;
  };
  web?: {
    site?: SiteInfo;
    navigation?: NavigationItem[];
    footer?: SiteFooterData;
    locale?: SiteLocaleItem;
    locales?: SiteLocaleItem[];
    ui?: SiteUiText;
  };
  meta?: {
    alternates?: SiteAlternateLink[];
  };
  page: {
    navigation: NavigationItem[];
    current: {
      title: string;
      label: string;
      href: string;
      layout: string;
      container?: 'fluid' | 'constrained' | 'wide' | 'narrow';
      description?: string;
    };
    document: {
      kind: 'page';
      format: 'markdown' | 'mdx';
      html: string;
      module?: string;
      diagnostics: Diagnostic[];
    };
    diagnostics: Diagnostic[];
  };
};

export default function PageShow({ app, page, web, meta }: Props) {
  const showDiagnostics = app?.env !== 'prod' && page.diagnostics.length > 0;
  const navigation = web?.navigation ?? page.navigation;
  const locales = mergeLocaleAlternates(web?.locales, meta?.alternates);
  const breadcrumbs = pageBreadcrumbs(page.current, navigation);
  const breadcrumbsNode = breadcrumbs.length > 1 ? <PageBreadcrumbs items={breadcrumbs} ui={web?.ui} /> : null;
  usePageScrollRestoration(`page.${page.current.href}`);

  return (
    <div className="page-shell" data-layout={page.current.layout} data-container={page.current.container ?? 'fluid'}>
      <SiteHeader
        className="page-header"
        navClassName="page-header-nav"
        navigation={navigation}
        site={web?.site}
        locales={locales}
        ui={web?.ui}
        activeHref={page.current.href}
      />

      <main className="page-layout">
        <section className="page-content" data-has-breadcrumbs={breadcrumbs.length > 1}>
          {page.document.format === 'mdx' && page.document.module ? (
            <MdxDocument
              className="page-document markdown-body"
              module={page.document.module}
              heroBefore={breadcrumbsNode}
              locale={web?.locale}
              ui={web?.ui}
            />
          ) : (
            <>
              {breadcrumbsNode}
              <MarkdownDocument
                className="page-document markdown-body"
                html={page.document.html}
              />
            </>
          )}

          {showDiagnostics ? <PageDiagnostics diagnostics={page.diagnostics} /> : null}
        </section>
      </main>

      <SiteFooter navigation={navigation} site={web?.site} footer={web?.footer} ui={web?.ui} />
    </div>
  );
}

function PageBreadcrumbs({ items, ui }: { items: NavigationItem[]; ui?: SiteUiText }) {
  return (
    <nav className="page-breadcrumbs" aria-label={ui?.breadcrumbsAria ?? 'Хлебные крошки'}>
      {items.map((item, index) => (
        <React.Fragment key={`${item.href}-${index}`}>
          {index > 0 ? <span>/</span> : null}
          {index === items.length - 1 ? (
            <strong>{item.label ?? item.title}</strong>
          ) : (
            <a href={item.href}>{item.label ?? item.title}</a>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

function pageBreadcrumbs(current: Props['page']['current'], navigation: NavigationItem[]): NavigationItem[] {
  if (current.href === '/') {
    return [];
  }

  const crumbs: NavigationItem[] = [];
  const home = navigation.find((item) => item.href === '/');
  if (home) {
    crumbs.push(home);
  }

  const segments = current.href.split('/').filter(Boolean);
  let href = '';

  for (let index = 0; index < segments.length - 1; index += 1) {
    href += `/${segments[index]}`;
    const item = navigation.find((candidate) => candidate.href === href);
    crumbs.push(item ?? {
      href,
      label: humanizePathSegment(segments[index]),
    });
  }

  crumbs.push({
    href: current.href,
    label: current.label || current.title,
    title: current.title,
  });

  return crumbs;
}

function humanizePathSegment(segment: string): string {
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/^./, (char) => char.toLocaleUpperCase('ru-RU'));
}

function PageDiagnostics({ diagnostics }: { diagnostics: Diagnostic[] }) {
  return (
    <details className="docs-diagnostics" aria-label="Diagnostics">
      <summary>
        <span className="docs-diagnostics-title">Diagnostics</span>
        <span>{diagnostics.length}</span>
      </summary>
      <ul>
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}-${index}`} data-level={diagnostic.level}>
            <code>{diagnostic.code}</code>
            <span>{diagnostic.message}</span>
            {diagnostic.path ? <small>{diagnostic.path}{diagnostic.line ? `:${diagnostic.line}` : ''}</small> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
