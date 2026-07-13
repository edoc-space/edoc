import React from 'react';
import { Drawer, Dropdown, Heading, Text } from '@phpsoftbox/react-softbox';
import { DocsSearch, SearchEntry } from '../../../Components/DocsSearch';
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

const notFoundImage = '/images/404.png';

type NavigationItem = {
  id?: string;
  label?: string;
  title?: string;
  href: string;
  slug?: string;
  path?: string;
  description?: string;
};

type DocsNode = {
  id: string;
  kind: 'category' | 'document';
  type: 'category' | 'document';
  title: string;
  label: string;
  slug: string | null;
  href: string | null;
  path: string;
  description?: string;
  collapsed?: boolean;
  expanded?: boolean;
  children?: DocsNode[];
};

type TocItem = {
  level: number;
  title: string;
  id: string;
};

type Diagnostic = {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  path?: string;
  line?: number | null;
};

type GeneratedIndexItem = {
  id: string;
  kind: 'category' | 'document' | string;
  type: 'category' | 'document' | string;
  title: string;
  label: string;
  href: string;
  description: string;
};

type DocumentationDocument =
  | {
      kind: 'document';
      format: 'markdown' | 'mdx';
      html: string;
      module?: string;
      toc: TocItem[];
      diagnostics: Diagnostic[];
    }
  | {
      kind: 'generated-index';
      format?: 'markdown' | 'mdx' | null;
      html: string;
      module?: string;
      has_intro?: boolean;
      items: GeneratedIndexItem[];
      toc: TocItem[];
      diagnostics: Diagnostic[];
    }
  | {
      kind: 'versions-index';
      html: string;
      items: DocumentationVersionItem[];
      toc: TocItem[];
      diagnostics: Diagnostic[];
    }
  | {
      kind: 'version-archive';
      html: string;
      version: DocumentationVersionItem;
      toc: TocItem[];
      diagnostics: Diagnostic[];
    };

type DocumentationVersionItem = {
  version: string;
  label: string;
  status: 'current' | 'supported' | 'archived' | string;
  href?: string;
  docs_enabled?: boolean;
  current?: boolean;
  archived_at?: string;
  released_at?: string;
};

type DocumentationVersions = {
  enabled?: boolean;
  current?: string;
  selected?: DocumentationVersionItem | null;
  all_href?: string;
  items?: DocumentationVersionItem[];
};

type Props = {
  title: string;
  app?: {
    env?: string;
  };
  documentation: {
    sidebars: NavigationItem[];
    active_sidebar: NavigationItem | null;
    tree: DocsNode[];
    current: DocsNode | null;
    document: DocumentationDocument | null;
    breadcrumbs: NavigationItem[];
    toc: TocItem[];
    diagnostics: Diagnostic[];
    search: SearchEntry[];
    versions?: DocumentationVersions;
    not_found: {
      slug: string;
    } | null;
    prev: NavigationItem | null;
    next: NavigationItem | null;
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
};

const TREE_EXPANDED_STORAGE_KEY = 'edoc.docs.tree.expanded.v1';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'edoc.docs.sidebar.collapsed.v1';

export default function DocumentationShow({ title, app, documentation, web, meta }: Props) {
  const current = documentation.current;
  const sidebars = documentation.sidebars ?? [];
  const activeSidebar = documentation.active_sidebar;
  const siteNavigation = web?.navigation ?? sidebars;
  const locales = mergeLocaleAlternates(web?.locales, meta?.alternates);
  const ui = web?.ui ?? {};
  const textLocale = web?.locale?.code ?? 'ru';
  const docsRootHref = web?.locale?.url_prefix ? `${web.locale.url_prefix}/docs` : '/docs';
  const activeHref = current?.href ?? activeSidebar?.href ?? null;
  const treeStorageKey = activeSidebar?.id
    ? `${TREE_EXPANDED_STORAGE_KEY}.${activeSidebar.id}`
    : TREE_EXPANDED_STORAGE_KEY;
  const showDiagnostics = app?.env !== 'prod' && documentation.diagnostics.length > 0;
  const hasDocumentationBody = documentation.not_found === null && current !== null && documentation.document !== null;
  const showOnPageToc = hasDocumentationBody && documentation.toc.length > 0;
  const generatedIndexHasIntro = documentation.document?.kind === 'generated-index' && documentation.document.has_intro === true;
  const [expandedNodes, setExpandedNodes] = React.useState<Record<string, boolean>>({});
  const [isMobileDocsNavOpen, setMobileDocsNavOpen] = React.useState(false);
  const [isMobileTocOpen, setMobileTocOpen] = React.useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [activeTocId, setActiveTocId] = React.useState<string | null>(null);
  usePageScrollRestoration(`docs.${current?.href ?? documentation.not_found?.slug ?? 'index'}`);

  React.useEffect(() => {
    setExpandedNodes(readStoredExpandedNodes(treeStorageKey));
  }, [treeStorageKey]);

  React.useEffect(() => {
    setSidebarCollapsed(readStoredBoolean(SIDEBAR_COLLAPSED_STORAGE_KEY));
  }, []);

  React.useEffect(() => {
    setMobileDocsNavOpen(false);
    setMobileTocOpen(false);
  }, [current?.href, documentation.not_found?.slug]);

  React.useEffect(() => {
    const toc = documentation.toc ?? [];
    if (toc.length === 0 || typeof window === 'undefined') {
      setActiveTocId(null);
      return;
    }

    let frameId = 0;
    const timeoutIds: number[] = [];

    const resolveActiveHeading = () => {
      frameId = 0;

      const headings = toc
        .map((item) => document.getElementById(item.id))
        .filter((heading): heading is HTMLElement => heading !== null);

      if (headings.length === 0) {
        setActiveTocId(null);
        return;
      }

      const topOffset = 112;
      const hashId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (hashId && headings.some((heading) => heading.id === hashId)) {
        const hashHeading = document.getElementById(hashId);
        if (hashHeading !== null && Math.abs(hashHeading.getBoundingClientRect().top - topOffset) < 36) {
          setActiveTocId(hashId);
          return;
        }
      }

      let activeHeading = headings[0];

      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= topOffset) {
          activeHeading = heading;
          continue;
        }

        break;
      }

      setActiveTocId(activeHeading.id);
    };

    const scheduleResolve = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(resolveActiveHeading);
    };

    scheduleResolve();
    timeoutIds.push(window.setTimeout(scheduleResolve, 80));
    timeoutIds.push(window.setTimeout(scheduleResolve, 260));
    window.addEventListener('scroll', scheduleResolve, { passive: true });
    window.addEventListener('resize', scheduleResolve);
    window.addEventListener('hashchange', scheduleResolve);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      window.removeEventListener('scroll', scheduleResolve);
      window.removeEventListener('resize', scheduleResolve);
      window.removeEventListener('hashchange', scheduleResolve);
    };
  }, [documentation.toc, current?.href]);

  const handleToggleNode = React.useCallback((nodeId: string, expanded: boolean) => {
    setExpandedNodes((currentState) => {
      const nextState = { ...currentState, [nodeId]: expanded };
      writeStoredExpandedNodes(treeStorageKey, nextState);

      return nextState;
    });
  }, [treeStorageKey]);

  const handleToggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((currentState) => {
      const nextState = !currentState;
      writeStoredBoolean(SIDEBAR_COLLAPSED_STORAGE_KEY, nextState);

      return nextState;
    });
  }, []);

  const handleTocClick = React.useCallback((event: React.MouseEvent<HTMLAnchorElement>, item: TocItem) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    const target = document.getElementById(item.id);
    if (target === null) {
      window.location.hash = item.id;
      return;
    }

    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#${encodeURIComponent(item.id)}`);
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
    setActiveTocId(item.id);
  }, []);

  const mobileHeaderControls = documentation.tree.length > 0 || showOnPageToc ? (
    <>
      {documentation.tree.length > 0 ? (
        <button
          type="button"
          className="docs-header-action docs-header-action--navigation"
          onClick={() => setMobileDocsNavOpen(true)}
        >
          {ui.documentation ?? 'Документация'}
        </button>
      ) : null}
      {showOnPageToc ? (
        <button
          type="button"
          className="docs-header-action docs-header-action--toc"
          onClick={() => setMobileTocOpen(true)}
        >
          {ui.tocTitle ?? 'Оглавление'}
        </button>
      ) : null}
    </>
  ) : null;

  return (
    <div className="docs-shell">
      <main className="docs-layout" data-sidebar-collapsed={isSidebarCollapsed}>
        <aside className="docs-sidebar" aria-label={ui.documentationNavAria ?? 'Навигация документации'}>
          <nav className="docs-tree-nav" aria-label={ui.documentationNavAria ?? 'Оглавление'}>
            {documentation.tree.length > 0 ? (
              <DocumentationTree
                nodes={documentation.tree}
                currentHref={current?.href ?? null}
                expandedNodes={expandedNodes}
                ui={ui}
                onToggleNode={handleToggleNode}
                onNavigate={() => undefined}
              />
            ) : null}
          </nav>

          <div className="docs-sidebar-tools">
            <button
              type="button"
              className="docs-sidebar-collapse"
              data-collapsed={isSidebarCollapsed}
              aria-label={isSidebarCollapsed
                ? (ui.expandSidebarAria ?? 'Развернуть сайдбар')
                : (ui.collapseSidebarAria ?? 'Свернуть сайдбар')}
              aria-pressed={isSidebarCollapsed}
              onClick={handleToggleSidebar}
            >
              <span className="docs-sidebar-collapse-icon" aria-hidden="true" />
              <span className="docs-sidebar-collapse-label">
                {isSidebarCollapsed ? (ui.expandSidebar ?? 'Развернуть') : (ui.collapseSidebar ?? 'Свернуть')}
              </span>
            </button>
          </div>
        </aside>

        <SiteHeader
          className="docs-header"
          navClassName="docs-header-nav"
          navigation={siteNavigation}
          site={web?.site}
          locales={locales}
          ui={ui}
          activeHref={activeHref}
          afterNav={(
            <>
              <DocsVersionDropdown versions={documentation.versions} ui={ui} />
              {documentation.search.length > 0 ? (
                <DocsSearch
                  provider={{ type: 'memory', entries: documentation.search ?? [] }}
                  ui={ui}
                  textLocale={textLocale}
                />
              ) : null}
            </>
          )}
          mobileControls={mobileHeaderControls}
        />

        <section className="docs-content">
          {documentation.not_found !== null ? (
            <>
              <NotFoundDocumentation
                slug={documentation.not_found.slug}
                docsHref={docsRootHref}
                searchEntries={documentation.search ?? []}
                ui={ui}
              />
              {showDiagnostics ? <Diagnostics diagnostics={documentation.diagnostics} /> : null}
            </>
          ) : current === null || documentation.document === null ? (
            <EmptyDocumentation ui={ui} />
          ) : (
            <>
              <header className="docs-content-header" data-intro-only={generatedIndexHasIntro}>
                {!generatedIndexHasIntro ? (
                  <>
                    <Heading level={1}>{title}</Heading>
                    {current.description ? <Text as="p" className="docs-content-description">{current.description}</Text> : null}
                  </>
                ) : null}
                <Breadcrumbs items={documentation.breadcrumbs} ui={ui} />
              </header>

              {documentation.document.kind === 'generated-index' ? (
                <GeneratedIndexDocument document={documentation.document} locale={web?.locale} ui={ui} />
              ) : documentation.document.kind === 'versions-index' ? (
                <VersionsOverview items={documentation.document.items} ui={ui} />
              ) : documentation.document.kind === 'version-archive' ? (
                <VersionArchiveNotice version={documentation.document.version} versions={documentation.versions} ui={ui} />
              ) : documentation.document.format === 'mdx' && documentation.document.module ? (
                <MdxDocument
                  className="docs-document markdown-body"
                  module={documentation.document.module}
                  locale={web?.locale}
                  ui={ui}
                />
              ) : (
                <MarkdownDocument
                  className="docs-document markdown-body"
                  html={documentation.document.html}
                />
              )}

              <DocsPager prev={documentation.prev} next={documentation.next} ui={ui} />
              {showDiagnostics ? <Diagnostics diagnostics={documentation.diagnostics} /> : null}
            </>
          )}
        </section>

        {showOnPageToc ? (
          <aside className="docs-onpage" aria-label={ui.tocAria ?? 'Оглавление страницы'}>
            <OnPageToc
              toc={documentation.toc}
              activeTocId={activeTocId}
              ui={ui}
              onTocClick={handleTocClick}
            />
          </aside>
        ) : null}

        <SiteFooter
          navigation={siteNavigation}
          site={web?.site}
          footer={web?.footer}
          ui={ui}
          className="docs-footer"
        />
      </main>

      <Drawer
        open={isMobileDocsNavOpen}
        title={ui.documentation ?? 'Документация'}
        position="left"
        width="min(88vw, 360px)"
        className="docs-mobile-drawer docs-mobile-drawer--navigation"
        overlayClassName="docs-mobile-drawer-overlay"
        onClose={() => setMobileDocsNavOpen(false)}
      >
        <nav className="docs-tree-nav docs-tree-nav--drawer" aria-label={ui.documentationNavAria ?? 'Оглавление'}>
          {documentation.tree.length > 0 ? (
            <DocumentationTree
              nodes={documentation.tree}
              currentHref={current?.href ?? null}
              expandedNodes={expandedNodes}
              ui={ui}
              onToggleNode={handleToggleNode}
              onNavigate={() => setMobileDocsNavOpen(false)}
            />
          ) : null}
        </nav>
      </Drawer>

      <Drawer
        open={isMobileTocOpen}
        title={ui.tocTitle ?? 'Оглавление'}
        position="right"
        width="min(88vw, 340px)"
        className="docs-mobile-drawer docs-mobile-drawer--toc"
        overlayClassName="docs-mobile-drawer-overlay"
        onClose={() => setMobileTocOpen(false)}
      >
        {showOnPageToc ? (
          <OnPageToc
            toc={documentation.toc}
            activeTocId={activeTocId}
            ui={ui}
            onTocClick={(event, item) => {
              handleTocClick(event, item);
              setMobileTocOpen(false);
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function DocumentationTree({
  nodes,
  currentHref,
  expandedNodes,
  ui,
  onToggleNode,
  onNavigate,
}: {
  nodes: DocsNode[];
  currentHref: string | null;
  expandedNodes: Record<string, boolean>;
  ui: SiteUiText;
  onToggleNode: (nodeId: string, expanded: boolean) => void;
  onNavigate: () => void;
}) {
  return (
    <ul className="docs-tree-list">
      {nodes.map((node) => {
        const hasChildren = (node.children?.length ?? 0) > 0;
        const expanded = hasChildren && isNodeExpanded(node, currentHref, expandedNodes);

        return (
          <li key={node.id}>
            <div className="docs-tree-row">
              {hasChildren ? (
                <button
                  type="button"
                  className="docs-tree-toggle"
                  aria-label={expanded ? (ui.collapseSectionAria ?? 'Свернуть раздел') : (ui.expandSectionAria ?? 'Развернуть раздел')}
                  aria-expanded={expanded}
                  onClick={() => onToggleNode(node.id, !expanded)}
                >
                  <span aria-hidden="true" />
                </button>
              ) : (
                <span className="docs-tree-toggle-spacer" aria-hidden="true" />
              )}

              <TreeLink node={node} currentHref={currentHref} onNavigate={onNavigate} />
            </div>

            {hasChildren && expanded ? (
              <DocumentationTree
                nodes={node.children ?? []}
                currentHref={currentHref}
                expandedNodes={expandedNodes}
                ui={ui}
                onToggleNode={onToggleNode}
                onNavigate={onNavigate}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TreeLink({
  node,
  currentHref,
  onNavigate,
}: {
  node: DocsNode;
  currentHref: string | null;
  onNavigate: () => void;
}) {
  const content = node.label || node.title;

  if (node.href === null) {
    return (
      <span className="docs-tree-link" data-active="false" data-node-type={node.kind}>
        {content}
      </span>
    );
  }

  return (
    <a
      href={node.href}
      className="docs-tree-link"
      data-active={node.href === currentHref}
      data-node-type={node.kind}
      aria-current={node.href === currentHref ? 'page' : undefined}
      onClick={onNavigate}
    >
      {content}
    </a>
  );
}

function OnPageToc({
  toc,
  activeTocId,
  ui,
  onTocClick,
}: {
  toc: TocItem[];
  activeTocId: string | null;
  ui: SiteUiText;
  onTocClick: (event: React.MouseEvent<HTMLAnchorElement>, item: TocItem) => void;
}) {
  return (
    <>
      <Text as="p" className="docs-onpage-title">{ui.tocTitle ?? 'Оглавление'}</Text>
      <nav>
        {toc.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            data-active={item.id === activeTocId}
            aria-current={item.id === activeTocId ? 'location' : undefined}
            style={{ paddingLeft: Math.max(0, item.level - 2) * 12 }}
            onClick={(event) => onTocClick(event, item)}
          >
            {item.title}
          </a>
        ))}
      </nav>
    </>
  );
}

function SectionOverview({ items, ui }: { items: GeneratedIndexItem[]; ui: SiteUiText }) {
  if (items.length === 0) {
    return <Text as="p" muted>{ui.sectionEmpty ?? 'В этом разделе пока нет документов.'}</Text>;
  }

  return (
    <nav className="docs-section-overview" aria-label={ui.sectionContentsAria ?? 'Содержание раздела'}>
      {items.map((item) => (
        <a key={item.id} href={item.href} className="docs-section-child" data-node-type={item.kind}>
          <span className="docs-section-child-title">{item.title}</span>
          {item.description ? <span className="docs-section-child-description">{item.description}</span> : null}
        </a>
      ))}
    </nav>
  );
}

function GeneratedIndexDocument({
  document,
  locale,
  ui,
}: {
  document: Extract<DocumentationDocument, { kind: 'generated-index' }>;
  locale?: SiteLocaleItem;
  ui: SiteUiText;
}) {
  return (
    <div className="docs-generated-index">
      {document.has_intro === true ? (
        document.format === 'mdx' && document.module ? (
          <MdxDocument
            className="docs-document markdown-body"
            module={document.module}
            locale={locale}
            ui={ui}
          />
        ) : (
          <MarkdownDocument
            className="docs-document markdown-body"
            html={document.html}
          />
        )
      ) : null}

      <SectionOverview items={document.items} ui={ui} />
    </div>
  );
}

function DocsVersionDropdown({ versions, ui }: { versions?: DocumentationVersions; ui: SiteUiText }) {
  const items = (versions?.items ?? []).filter((item) => item.docs_enabled === true && Boolean(item.href));
  const selected = versions?.selected ?? items.find((item) => item.current) ?? items[0] ?? null;

  if (versions?.enabled !== true || selected === null || items.length === 0) {
    return null;
  }

  return (
    <Dropdown
      align="right"
      placement="down"
      className="docs-version-dropdown"
      triggerClassName="docs-version-trigger"
      triggerAriaLabel={ui.versionsLabel ?? 'Версия документации'}
      trigger={[
        <span key="label" className="docs-version-current">{selected.label}</span>,
        <span key="caret" className="docs-version-caret" aria-hidden="true" />,
      ]}
    >
      <Dropdown.Nav className="docs-version-menu">
        {items.map((item) => (
          <Dropdown.Item
            key={item.version}
            href={item.current ? undefined : item.href}
            className={`docs-version-menu-item${item.current ? ' docs-version-menu-item-current' : ''}`}
          >
            {item.label}
          </Dropdown.Item>
        ))}
        {versions?.all_href ? (
          <>
            <Dropdown.Separator />
            <Dropdown.Item href={versions.all_href} className="docs-version-menu-all">
              {ui.allVersions ?? 'Все версии'}
            </Dropdown.Item>
          </>
        ) : null}
      </Dropdown.Nav>
    </Dropdown>
  );
}

function VersionsOverview({ items, ui }: { items: DocumentationVersionItem[]; ui: SiteUiText }) {
  if (items.length === 0) {
    return <Text as="p" muted>{ui.sectionEmpty ?? 'В этом разделе пока нет документов.'}</Text>;
  }

  return (
    <div className="docs-versions-table-wrap">
      <table className="docs-versions-table">
        <thead>
          <tr>
            <th>{ui.version ?? 'Версия'}</th>
            <th>{ui.status ?? 'Статус'}</th>
            <th>URL</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.version} data-status={item.status}>
              <td>
                {item.docs_enabled === true && item.href ? (
                  <a href={item.href}>{item.label}</a>
                ) : (
                  <span>{item.label}</span>
                )}
              </td>
              <td>{versionStatusLabel(item, ui)}</td>
              <td>
                {item.docs_enabled === true && item.href ? (
                  <code>{item.href}</code>
                ) : (
                  <span className="docs-muted-dash">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VersionArchiveNotice({
  version,
  versions,
  ui,
}: {
  version: DocumentationVersionItem;
  versions?: DocumentationVersions;
  ui: SiteUiText;
}) {
  const current = (versions?.items ?? []).find((item) => item.status === 'current' && item.href);

  return (
    <section className="docs-version-archive">
      <Text as="p">
        {ui.archivedVersionDescription ?? 'Документация для этой версии больше не публикуется и не участвует в поиске.'}
      </Text>
      {current?.href ? (
        <a href={current.href}>{ui.openCurrentVersion ?? 'Открыть текущую версию'}</a>
      ) : null}
    </section>
  );
}

function versionStatusLabel(item: DocumentationVersionItem, ui: SiteUiText): string {
  if (item.status === 'current') {
    return ui.currentVersion ?? 'Текущая';
  }

  if (item.status === 'archived') {
    return ui.archivedVersion ?? 'Архивная';
  }

  return ui.supportedVersion ?? 'Поддерживается';
}

function readStoredExpandedNodes(storageKey: string): Record<string, boolean> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const rawState = window.localStorage.getItem(storageKey);
    if (rawState === null) {
      return {};
    }

    const parsedState = JSON.parse(rawState);
    if (typeof parsedState !== 'object' || parsedState === null || Array.isArray(parsedState)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsedState).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
    );
  } catch {
    return {};
  }
}

function writeStoredExpandedNodes(storageKey: string, expandedNodes: Record<string, boolean>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(expandedNodes));
}

function readStoredBoolean(storageKey: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(storageKey) === 'true';
}

function writeStoredBoolean(storageKey: string, value: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, value ? 'true' : 'false');
}

function isNodeExpanded(
  node: DocsNode,
  currentHref: string | null,
  expandedNodes: Record<string, boolean>,
): boolean {
  if (hasActiveChild(node, currentHref)) {
    return true;
  }

  if (node.id in expandedNodes) {
    return expandedNodes[node.id];
  }

  return node.expanded ?? (node.collapsed === undefined ? true : !node.collapsed);
}

function Breadcrumbs({ items, ui }: { items: NavigationItem[]; ui: SiteUiText }) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <nav className="docs-breadcrumbs" aria-label={ui.breadcrumbsAria ?? 'Хлебные крошки'}>
      {items.map((item, index) => (
        <React.Fragment key={`${item.href}-${index}`}>
          {index > 0 ? <span>/</span> : null}
          {index === items.length - 1 ? <strong>{item.label ?? item.title}</strong> : <a href={item.href}>{item.label ?? item.title}</a>}
        </React.Fragment>
      ))}
    </nav>
  );
}

function DocsPager({ prev, next, ui }: { prev: NavigationItem | null; next: NavigationItem | null; ui: SiteUiText }) {
  if (prev === null && next === null) {
    return null;
  }

  return (
    <nav className="docs-pager" aria-label={ui.pagerAria ?? 'Навигация между страницами'}>
      {prev ? <a href={prev.href} rel="prev"><span>{ui.previousPage ?? 'Назад'}</span>{prev.label ?? prev.title}</a> : <span />}
      {next ? <a href={next.href} rel="next"><span>{ui.nextPage ?? 'Дальше'}</span>{next.label ?? next.title}</a> : <span />}
    </nav>
  );
}

function Diagnostics({ diagnostics }: { diagnostics: Diagnostic[] }) {
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

function NotFoundDocumentation({
  slug,
  docsHref,
  searchEntries,
  ui,
}: {
  slug: string;
  docsHref: string;
  searchEntries: SearchEntry[];
  ui: SiteUiText;
}) {
  const suggestions = searchEntries.slice(0, 4);

  return (
    <DocumentationEmptyState
      className="docs-not-found"
      title={ui.notFoundTitle ?? 'Страница не найдена'}
      description={(
        <>
          {ui.notFoundDescription ?? 'Запрошенный путь не найден в текущей структуре документации.'}
          {slug ? <> <code>{slug}</code></> : null}
        </>
      )}
      action={<a href={docsHref}>{ui.goToDocumentation ?? 'Перейти к документации'}</a>}
    >
      {suggestions.length > 0 ? (
        <nav className="docs-not-found-suggestions" aria-label={ui.popularPagesAria ?? 'Популярные страницы'}>
          {suggestions.map((entry) => (
            <a key={entry.id} href={entry.href}>
              <span>{entry.title}</span>
              {entry.description ? <small>{entry.description}</small> : null}
            </a>
          ))}
        </nav>
      ) : null}
    </DocumentationEmptyState>
  );
}

function EmptyDocumentation({ ui }: { ui: SiteUiText }) {
  return (
    <DocumentationEmptyState
      title={ui.emptyDocumentationTitle ?? 'Документация пока не опубликована'}
      description={ui.emptyDocumentationText ?? 'Добавьте Markdown-файлы в docs root и обновите страницу.'}
    />
  );
}

function DocumentationEmptyState({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`docs-empty ${className}`.trim()}>
      <img src={notFoundImage} alt="" aria-hidden="true" className="docs-empty-image" />
      <div className="docs-empty-body">
        <Heading level={1}>{title}</Heading>
        <Text as="p" muted>{description}</Text>
        {action ? <div className="docs-empty-actions">{action}</div> : null}
        {children}
      </div>
    </section>
  );
}

function hasActiveChild(node: DocsNode, currentHref: string | null): boolean {
  if (currentHref === null) {
    return false;
  }

  if (node.href === currentHref) {
    return true;
  }

  return (node.children ?? []).some((child) => hasActiveChild(child, currentHref));
}
