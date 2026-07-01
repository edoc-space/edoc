import React from 'react';
import { useCodeHighlighting } from './CodeHighlighting';
import { useMarkdownTabs } from './MarkdownInteractions';

type MarkdownDocumentProps = {
  html: string;
  className: string;
};

export function MarkdownDocument({ html, className }: MarkdownDocumentProps) {
  const rootRef = React.useRef<HTMLElement | null>(null);
  const dangerousHtml = React.useMemo(() => ({ __html: html }), [html]);

  useCodeHighlighting(rootRef, [html]);
  useMarkdownTabs(rootRef, [html]);

  return (
    <article
      ref={rootRef}
      className={className}
      dangerouslySetInnerHTML={dangerousHtml}
    />
  );
}
