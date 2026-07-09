import React from 'react';
import { useCodeHighlighting } from './CodeHighlighting';
import { useMarkdownImagePreview } from './MarkdownImagePreview';
import { useMarkdownTabs, useMarkdownVideoEmbeds } from './MarkdownInteractions';

type MarkdownDocumentProps = {
  html: string;
  className: string;
};

export function MarkdownDocument({ html, className }: MarkdownDocumentProps) {
  const rootRef = React.useRef<HTMLElement | null>(null);
  const dangerousHtml = React.useMemo(() => ({ __html: html }), [html]);
  const imagePreview = useMarkdownImagePreview(rootRef, [html]);

  useCodeHighlighting(rootRef, [html]);
  useMarkdownTabs(rootRef, [html]);
  useMarkdownVideoEmbeds(rootRef, [html]);

  return (
    <>
      <article
        ref={rootRef}
        className={className}
        dangerouslySetInnerHTML={dangerousHtml}
      />
      {imagePreview}
    </>
  );
}
