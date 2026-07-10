import React from 'react';
import { DocsSearch, type SearchProviderConfig } from '../DocsSearch';
import { MdxLayoutContext } from './context';
import type { HelpCenterProps, HelpFaqProps, HelpLinkProps, HelpSectionProps } from './types';
import { blockClass, columnsData, variantData } from './utils';

export function HelpCenter({
  title,
  subtitle,
  searchProvider = 'static',
  searchEndpoint,
  searchPlaceholder,
  variant,
  className,
  children,
}: HelpCenterProps) {
  const { heroBefore, locale, ui = {} } = React.useContext(MdxLayoutContext);
  const endpoint = searchEndpoint || `${locale?.url_prefix ?? ''}/docs/search-index.json`;
  const provider = resolveHelpSearchProvider(searchProvider, endpoint);
  const textLocale = locale?.code ?? 'ru';

  return (
    <section className={blockClass('help-center', className)} {...variantData(variant)}>
      <div className="help-center__header">
        {heroBefore ? <div className="markdown-hero__before">{heroBefore}</div> : null}
        {title ? <h1 className="help-center__title">{title}</h1> : null}
        {subtitle ? <p className="help-center__subtitle">{subtitle}</p> : null}
        <DocsSearch
          className="help-center__search"
          provider={provider}
          ui={ui}
          textLocale={textLocale}
          placeholder={searchPlaceholder || ui.searchPlaceholder || 'Поиск'}
          triggerLabel={searchPlaceholder || ui.searchPlaceholder || 'Поиск'}
          variant="hero"
        />
      </div>

      {children ? <div className="help-center__content">{children}</div> : null}
    </section>
  );
}

export function HelpSection({ title, eyebrow, columns, variant, className, children }: HelpSectionProps) {
  return (
    <section className={['help-center-section', className].filter(Boolean).join(' ')} {...variantData(variant)}>
      {eyebrow ? <p className="help-center-section__eyebrow">{eyebrow}</p> : null}
      {title ? <h2 className="help-center-section__title">{title}</h2> : null}
      <div className="help-center-section__grid" {...columnsData(columns)}>
        {children}
      </div>
    </section>
  );
}

export function HelpLink({ href, title, icon, description, className, children }: HelpLinkProps) {
  const label = title || children;

  return (
    <a className={['help-center-link', className].filter(Boolean).join(' ')} href={href}>
      {icon ? <span className="help-center-link__icon" aria-hidden="true">{icon}</span> : null}
      <span className="help-center-link__body">
        <span className="help-center-link__title">{label}</span>
        {description ? <span className="help-center-link__description">{description}</span> : null}
      </span>
    </a>
  );
}

export function HelpFaq({ question, href, className, children }: HelpFaqProps) {
  if (href) {
    return (
      <a className={['help-center-faq', className].filter(Boolean).join(' ')} href={href}>
        <span className="help-center-faq__question">{question}</span>
        {children ? <span className="help-center-faq__answer">{children}</span> : null}
      </a>
    );
  }

  return (
    <details className={['help-center-faq', className].filter(Boolean).join(' ')}>
      <summary className="help-center-faq__question">{question}</summary>
      {children ? <div className="help-center-faq__answer">{children}</div> : null}
    </details>
  );
}

function resolveHelpSearchProvider(searchProvider: HelpCenterProps['searchProvider'], endpoint: string): SearchProviderConfig {
  if (typeof searchProvider === 'string') {
    return { type: searchProvider, endpoint };
  }

  return {
    ...searchProvider,
    endpoint: searchProvider.endpoint || endpoint,
  };
}
