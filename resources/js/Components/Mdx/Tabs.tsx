import React from 'react';
import { BlockProps } from './types';

export function Tabs({ children, className }: BlockProps) {
  return <div className={['markdown-tabs', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function Tab({ title, children }: BlockProps & { title?: string }) {
  return (
    <section className="markdown-tabs__panel markdown-tabs__panel--active">
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  );
}
