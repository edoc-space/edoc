import React from 'react';
import { Drawer, Dropdown } from '@phpsoftbox/react-softbox';
import logoUrl from '../../images/logo.svg';

export type SiteNavigationItem = {
  id?: string;
  title?: string;
  label?: string;
  href: string;
  description?: string;
  source?: string;
  footer_column?: string;
};

export type SiteInfo = {
  title?: string;
  description?: string;
  links?: {
    github?: string;
  };
  brand?: {
    name?: string;
    href?: string;
    logo?: {
      src?: string;
      alt?: string;
    };
  };
};

export type SiteFooterColumn = {
  title: string;
  items: SiteNavigationItem[];
};

export type SiteFooterData = {
  enabled?: boolean;
  description?: string;
  columns?: SiteFooterColumn[];
  copyright?: string;
};

export type SiteLocaleItem = {
  code: string;
  label: string;
  href: string;
  url_prefix?: string;
  default?: boolean;
  current?: boolean;
};

export type SiteAlternateLink = {
  locale: string;
  href: string;
};

export type SiteUiText = {
  site?: string;
  documentation?: string;
  section?: string;
  headerAria?: string;
  primaryNavigationAria?: string;
  footerNavigationAria?: string;
  languageSwitcherAria?: string;
  breadcrumbsAria?: string;
  documentationNavAria?: string;
  closeMenu?: string;
  openMenu?: string;
  tocAria?: string;
  tocTitle?: string;
  searchPlaceholder?: string;
  searchAria?: string;
  searchOpenAria?: string;
  searchClose?: string;
  searchStart?: string;
  searchEmpty?: string;
  githubAria?: string;
  versionsLabel?: string;
  version?: string;
  allVersions?: string;
  currentVersion?: string;
  supportedVersion?: string;
  archivedVersion?: string;
  archivedVersionDescription?: string;
  openCurrentVersion?: string;
  status?: string;
  category?: string;
  document?: string;
  sectionContentsAria?: string;
  sectionEmpty?: string;
  collapseSidebarAria?: string;
  expandSidebarAria?: string;
  collapseSidebar?: string;
  expandSidebar?: string;
  collapseSectionAria?: string;
  expandSectionAria?: string;
  pagerAria?: string;
  previousPage?: string;
  nextPage?: string;
  notFoundTitle?: string;
  notFoundDescription?: string;
  goToDocumentation?: string;
  popularPagesAria?: string;
  emptyDocumentationTitle?: string;
  emptyDocumentationText?: string;
  footerPoweredBy?: string;
};

type SiteHeaderProps = {
  navigation: SiteNavigationItem[];
  site?: SiteInfo;
  locales?: SiteLocaleItem[];
  ui?: SiteUiText;
  activeHref?: string | null;
  className: string;
  navClassName: string;
  beforeBrand?: React.ReactNode;
  afterNav?: React.ReactNode;
  mobileControls?: React.ReactNode;
};

type SiteFooterProps = {
  navigation: SiteNavigationItem[];
  site?: SiteInfo;
  footer?: SiteFooterData;
  ui?: SiteUiText;
  className?: string;
};

export function SiteHeader({
  navigation,
  site,
  locales = [],
  ui,
  activeHref = null,
  className,
  navClassName,
  beforeBrand = null,
  afterNav = null,
  mobileControls = null,
}: SiteHeaderProps) {
  const githubHref = site?.links?.github;
  const [isMobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const hasActions = afterNav !== null || locales.length > 1 || Boolean(githubHref);
  const hasNavigation = navigation.length > 0;

  return (
    <>
      <header className={`site-header ${className}`.trim()} aria-label={ui?.headerAria ?? 'Верхнее меню'}>
        {hasNavigation ? (
          <button
            type="button"
            className="site-menu-button"
            aria-label={ui?.openMenu ?? 'Открыть меню'}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <span aria-hidden="true" />
          </button>
        ) : null}

        {beforeBrand}

        <BrandLockup site={site} className="site-header-brand" />

        {hasNavigation ? (
          <nav className={navClassName} aria-label={ui?.primaryNavigationAria ?? 'Основная навигация'}>
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                data-active={isActiveNavigationHref(item.href, activeHref)}
              >
                {item.label ?? item.title}
              </a>
            ))}
          </nav>
        ) : null}

        {hasActions ? (
          <div className="site-header-actions">
            {afterNav}
            {githubHref ? <GithubLink href={githubHref} ui={ui} /> : null}
            <LanguageSwitcher locales={locales} ui={ui} />
          </div>
        ) : null}

        {mobileControls !== null ? (
          <div className="site-header-mobile-controls">
            {mobileControls}
          </div>
        ) : null}
      </header>

      <Drawer
        open={isMobileMenuOpen}
        title={ui?.primaryNavigationAria ?? 'Меню'}
        position="left"
        width="min(88vw, 360px)"
        className="site-menu-drawer"
        overlayClassName="site-menu-drawer-overlay"
        onClose={() => setMobileMenuOpen(false)}
      >
        <nav className="site-menu-drawer-nav" aria-label={ui?.primaryNavigationAria ?? 'Основная навигация'}>
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              data-active={isActiveNavigationHref(item.href, activeHref)}
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.label ?? item.title}
            </a>
          ))}
        </nav>

        {githubHref || locales.length > 1 ? (
          <div className="site-menu-drawer-extra">
            {githubHref ? (
              <a href={githubHref} target="_blank" rel="noreferrer" onClick={() => setMobileMenuOpen(false)}>
                GitHub
              </a>
            ) : null}
            {locales.length > 1 ? (
              <nav aria-label={ui?.languageSwitcherAria ?? 'Выбор языка'}>
                {locales.map((locale) => (
                  locale.current ? (
                    <span key={locale.code} data-active="true">{locale.label}</span>
                  ) : (
                    <a key={locale.code} href={locale.href} onClick={() => setMobileMenuOpen(false)}>{locale.label}</a>
                  )
                ))}
              </nav>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

export function SiteFooter({ navigation, site, footer, ui, className = '' }: SiteFooterProps) {
  if (footer?.enabled === false) {
    return null;
  }

  const columns = (footer?.columns?.length ? footer.columns : footerColumns(navigation, ui))
    .filter((column) => column.items.length > 0);
  const description = footer?.description || site?.description || 'Self-hosted documentation hosting на Markdown-файлах.';

  return (
    <footer className={`site-footer ${className}`.trim()}>
      <div className="site-footer-inner" data-has-columns={columns.length > 0}>
        <div className="site-footer-brand">
          <BrandLockup site={site} />
          <FooterDescription description={description} copyright={footer?.copyright} ui={ui} />
        </div>

        {columns.length > 0 ? (
          <nav className="site-footer-columns" aria-label={ui?.footerNavigationAria ?? 'Навигация в подвале'}>
            {columns.map((column) => (
              <section key={column.title} className="site-footer-column">
                <h2>{column.title}</h2>
                {column.items.map((item) => (
                  <a key={item.href} href={item.href}>
                    {item.label ?? item.title ?? item.href}
                  </a>
                ))}
              </section>
            ))}
          </nav>
        ) : null}
      </div>
    </footer>
  );
}

export function BrandLockup({ site, className = '' }: { site?: SiteInfo; className?: string }) {
  const brandName = site?.brand?.name ?? 'e-doc';
  const brandHref = site?.brand?.href ?? '/';

  return (
    <a href={brandHref} className={`brand-lockup ${className}`.trim()} aria-label={brandName}>
      <SiteLogo site={site} />
      <span className="brand-name">{brandName}</span>
    </a>
  );
}

export function SiteLogo({ site, className = '' }: { site?: SiteInfo; className?: string }) {
  const brandLogoSrc = site?.brand?.logo?.src || logoUrl;
  const brandLogoAlt = site?.brand?.logo?.alt ?? '';

  return (
    <span className={`brand-mark ${className}`.trim()}>
      <img src={brandLogoSrc} alt={brandLogoAlt} className="brand-logo" />
    </span>
  );
}

function FooterDescription({ description, copyright, ui }: { description: string; copyright?: string; ui?: SiteUiText }) {
  return (
    <p>
      {description}
      <br />
      <span>
        {ui?.footerPoweredBy ?? 'Создано на базе'}{' '}
        <a href="https://e-doc.space" target="_blank" rel="noreferrer">
          e-doc.space
        </a>
      </span>
      {copyright ? (
        <>
          <br />
          <small>{copyright}</small>
        </>
      ) : null}
    </p>
  );
}

export function mergeLocaleAlternates(
  locales: SiteLocaleItem[] | undefined,
  alternates: SiteAlternateLink[] | undefined,
): SiteLocaleItem[] {
  if (!locales?.length) {
    return [];
  }

  const alternateHrefByLocale = new Map<string, string>();
  for (const alternate of alternates ?? []) {
    if (alternate.locale === 'x-default' || !alternate.href) {
      continue;
    }

    alternateHrefByLocale.set(alternate.locale, normalizeAlternateHref(alternate.href));
  }

  return locales.map((locale) => ({
    ...locale,
    href: alternateHrefByLocale.get(locale.code) ?? locale.href,
  }));
}

function LanguageSwitcher({ locales, ui }: { locales: SiteLocaleItem[]; ui?: SiteUiText }) {
  if (locales.length <= 1) {
    return null;
  }

  const currentLocale = locales.find((locale) => locale.current) ?? locales[0];

  return (
    <Dropdown
      align="right"
      placement="down"
      className="language-switcher"
      triggerClassName="language-switcher-trigger"
      triggerAriaLabel={ui?.languageSwitcherAria ?? 'Выбор языка'}
      trigger={[
        <span key="label" className="language-switcher-current">{currentLocale.label}</span>,
        <span key="caret" className="language-switcher-caret" aria-hidden="true" />,
      ]}
    >
      <Dropdown.Nav className="language-switcher-menu">
        {locales.map((locale) => (
          <Dropdown.Item
            key={locale.code}
            href={locale.current ? undefined : locale.href}
            className={`language-switcher-item${locale.current ? ' language-switcher-item-current' : ''}`}
          >
            {locale.label}
          </Dropdown.Item>
        ))}
      </Dropdown.Nav>
    </Dropdown>
  );
}

function GithubLink({ href, ui }: { href: string; ui?: SiteUiText }) {
  return (
    <a
      href={href}
      className="site-header-icon-link"
      aria-label={ui?.githubAria ?? 'GitHub'}
      target="_blank"
      rel="noreferrer"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M12 2C6.48 2 2 6.59 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-1.05-.01-1.91-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 5.99c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.08 10.08 0 0 0 22 12.25C22 6.59 17.52 2 12 2Z"
        />
      </svg>
    </a>
  );
}

function normalizeAlternateHref(href: string): string {
  if (!/^https?:\/\//i.test(href)) {
    return href;
  }

  try {
    const url = new URL(href);

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function footerColumns(navigation: SiteNavigationItem[], ui?: SiteUiText): SiteFooterColumn[] {
  const columns = new Map<string, SiteNavigationItem[]>();

  for (const item of navigation) {
    const title = item.footer_column ?? defaultFooterColumn(item, ui);
    const items = columns.get(title) ?? [];
    items.push(item);
    columns.set(title, items);
  }

  return Array.from(columns.entries()).map(([title, items]) => ({ title, items }));
}

function defaultFooterColumn(item: SiteNavigationItem, ui?: SiteUiText): string {
  if (item.source === 'docs' || item.href.startsWith('/docs')) {
    return ui?.documentation ?? 'Документация';
  }

  return ui?.site ?? 'Сайт';
}

function isActiveNavigationHref(href: string, activeHref: string | null): boolean {
  const currentPath = activeHref ?? currentBrowserPath();
  if (currentPath === null) {
    return false;
  }

  if (href === '/' || isLocaleRootHref(href)) {
    return currentPath === href;
  }

  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function isLocaleRootHref(href: string): boolean {
  return /^\/[a-z]{2}(?:-[a-z]{2})?$/i.test(href);
}

function currentBrowserPath(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.pathname;
}
