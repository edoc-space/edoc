import React from 'react';
import {
  SiteFooter,
  SiteFooterData,
  SiteHeader,
  SiteInfo,
  SiteLocaleItem,
  SiteNavigationItem,
  SiteUiText,
} from '../../../Layouts/SiteLayout';

type Props = {
  title: string;
  web?: {
    site?: SiteInfo;
    navigation?: SiteNavigationItem[];
    footer?: SiteFooterData;
    locales?: SiteLocaleItem[];
    locale?: {
      code?: string;
      url_prefix?: string;
    };
    ui?: SiteUiText;
  };
  error: {
    status: number;
    title: string;
    message: string;
    image: string;
    details?: {
      location: string;
      trace: string;
    } | null;
  };
  request?: {
    href?: string;
  };
};

export default function ErrorShow({ error, request, web }: Props) {
  const navigation = web?.navigation ?? [];
  const homeHref = web?.site?.brand?.href ?? '/';
  const docsHref = documentationHref(navigation, web?.locale?.url_prefix ?? '');
  const isEnglish = web?.locale?.code === 'en';
  const homeLabel = isEnglish ? 'Home' : 'На главную';
  const errorLabel = isEnglish ? 'Error' : 'Ошибка';

  return (
    <div className="page-shell" data-layout="error">
      <SiteHeader
        className="page-header"
        navClassName="page-header-nav"
        navigation={navigation}
        site={web?.site}
        locales={web?.locales ?? []}
        ui={web?.ui}
        activeHref={request?.href ?? null}
      />

      <main className="error-page-layout">
        <section className="error-page-state">
          <img className="error-page-image" src={error.image} alt="" />
          <div className="error-page-content">
            <p className="error-page-code">{errorLabel} {error.status}</p>
            <h1>{error.title}</h1>
            <p>{error.message}</p>
            <div className="error-page-actions">
              <a href={docsHref}>{web?.ui?.goToDocumentation ?? 'Перейти к документации'}</a>
              <a href={homeHref}>{homeLabel}</a>
            </div>
            {error.details ? (
              <details className="error-page-details">
                <summary>{error.details.location}</summary>
                <pre>{error.details.trace}</pre>
              </details>
            ) : null}
          </div>
        </section>
      </main>

      <SiteFooter navigation={navigation} site={web?.site} footer={web?.footer} ui={web?.ui} />
    </div>
  );
}

function documentationHref(navigation: SiteNavigationItem[], localePrefix: string): string {
  const item = navigation.find((candidate) => candidate.href === '/docs' || candidate.href.endsWith('/docs'));
  if (item) {
    return item.href;
  }

  return localePrefix ? `${localePrefix}/docs` : '/docs';
}
