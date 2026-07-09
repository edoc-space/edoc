import React from 'react';
import { MDXProvider } from '@mdx-js/react';
import { useCodeHighlighting } from './CodeHighlighting';
import { useMarkdownImagePreview } from './MarkdownImagePreview';
import { useMarkdownTabs } from './MarkdownInteractions';
import { createMdxHeadingContext, MdxHeadingContext, MdxLayoutContext } from './Mdx/context';
import { mdxComponents } from './Mdx';
import type { SiteLocaleItem, SiteUiText } from '../Layouts/SiteLayout';

type MdxModule = {
  default: React.ComponentType<{ components?: typeof mdxComponents }>;
};

type MdxDocumentProps = {
  module: string;
  className: string;
  heroBefore?: React.ReactNode;
  locale?: SiteLocaleItem;
  ui?: SiteUiText;
};

const mdxModules = {
  ...import.meta.glob('/local/storage/edoc/*/pages/**/*.mdx'),
  ...import.meta.glob('/local/storage/edoc/*/docs/**/*.mdx'),
} as Record<string, () => Promise<MdxModule>>;

export function MdxDocument({ module, className, heroBefore, locale, ui }: MdxDocumentProps) {
  const rootRef = React.useRef<HTMLElement | null>(null);
  const [Component, setComponent] = React.useState<MdxModule['default'] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const headingContext = createMdxHeadingContext();
  const imagePreview = useMarkdownImagePreview(rootRef, [Component, module]);

  useCodeHighlighting(rootRef, [Component, module]);
  useMarkdownTabs(rootRef, [Component, module]);

  React.useEffect(() => {
    let active = true;
    const load = mdxModules[module];

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
  }, [module]);

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
        <MdxLayoutContext.Provider value={{ heroBefore, locale, ui }}>
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
