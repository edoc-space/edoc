import runtimeAbi from 'virtual:edoc-blog-abi';
import React from 'react';
import { MDXProvider } from '@mdx-js/react';
import { useCodeHighlighting } from './CodeHighlighting';
import { useMarkdownImagePreview } from './MarkdownImagePreview';
import { useMarkdownTabs } from './MarkdownInteractions';
import { createMdxHeadingContext, MdxHeadingContext, MdxLayoutContext } from './Mdx/context';
import { mdxComponents } from './Mdx';
import type { SiteLocaleItem, SiteUiText } from '../Layouts/SiteLayout';
import type { PublicArticles } from './Mdx/Collections';

type MdxModule = {
  default: React.ComponentType<{ components?: typeof mdxComponents }>;
};

export type PrivateMdxDescriptor = { abi: string; entry: string | null; css: string[] };

type MdxDocumentProps = {
  privateRuntime?: PrivateMdxDescriptor;
  module: string;
  className: string;
  heroBefore?: React.ReactNode;
  locale?: SiteLocaleItem;
  ui?: SiteUiText;
  latestArticles?: PublicArticles;
};

const mdxModules = {
  ...import.meta.glob('/local/storage/edoc/*/pages/**/*.mdx'),
  ...import.meta.glob('/local/storage/edoc/*/docs/**/*.mdx'),
} as Record<string, () => Promise<MdxModule>>;

export function MdxDocument({ module, className, heroBefore, locale, ui, privateRuntime, latestArticles }: MdxDocumentProps) {
  const rootRef = React.useRef<HTMLElement | null>(null);
  const [Component, setComponent] = React.useState<MdxModule['default'] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const headingContext = createMdxHeadingContext();
  const imagePreview = useMarkdownImagePreview(rootRef, [Component, module]);

  useCodeHighlighting(rootRef, [Component, module]);
  useMarkdownTabs(rootRef, [Component, module]);

  React.useEffect(() => {
    let active = true;
    const load = privateRuntime ? () => loadPrivateModule(module, privateRuntime) : mdxModules[module];

    setComponent(null);
    setError(null);

    if (!load) {
      setError(`MDX module not found: ${module}`);
      return () => {
        active = false;
      };
    }

    load()
      .then((loadedModule) => {
        if (active) {
          setComponent(() => loadedModule.default);
        }
      })
      .catch((exception: unknown) => {
        if (active) {
          setError(exception instanceof Error ? exception.message : `Failed to load MDX module: ${module}`);
        }
      });

    return () => {
      active = false;
    };
  }, [module, privateRuntime]);

  if (error) {
    return (
      <>
        <article ref={rootRef} className={className}>
          <pre>{error}</pre>
        </article>
        {imagePreview}
      </>
    );
  }

  if (!Component) {
    return (
      <>
        <article ref={rootRef} className={className} aria-busy="true" />
        {imagePreview}
      </>
    );
  }

  return (
    <>
      <article ref={rootRef} className={className}>
        <MdxLayoutContext.Provider value={{ heroBefore, locale, ui, latestArticles }}>
          <MdxHeadingContext.Provider value={headingContext}>
            <MDXProvider components={mdxComponents}>
              <Component components={mdxComponents} />
            </MDXProvider>
          </MdxHeadingContext.Provider>
        </MdxLayoutContext.Provider>
      </article>
      {imagePreview}
    </>
  );
}

async function loadPrivateModule(url: string, descriptor: PrivateMdxDescriptor): Promise<MdxModule> {
  if (descriptor.abi !== runtimeAbi) {
    // A full navigation obtains the matching app. A second mismatch renders a
    // safe error rather than looping or loading a second copy of React.
    const key = 'edoc.blog.reload';
    if (sessionStorage.getItem(key) !== descriptor.abi) {
      sessionStorage.setItem(key, descriptor.abi);
      window.location.reload();
    }
    throw new Error('Blog runtime changed. Reload this page.');
  }
  sessionStorage.removeItem('edoc.blog.reload');
  const namespace = /^(?:\/[^?#]+)?\/blog\/_modules\/[a-f0-9]{32}\/[a-f0-9]{32}\//;
  if (!namespace.test(url)) throw new Error('Invalid blog module.');
  await Promise.all(descriptor.css.map((href) => new Promise<void>((resolve, reject) => {
    if (!namespace.test(href)) return reject(new Error('Invalid blog stylesheet.'));
    const existing = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].find((link) => link.getAttribute('href') === href);
    if (existing?.sheet) return resolve();
    const link = existing ?? document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error('Blog stylesheet unavailable.'));
    if (!existing) document.head.appendChild(link);
  })));
  return import(/* @vite-ignore */ url) as Promise<MdxModule>;
}
