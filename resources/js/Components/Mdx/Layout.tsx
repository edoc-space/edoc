import React from 'react';
import { CommonBlockProps, LayoutProps } from './types';
import { blockClass, columnsData, variantData } from './utils';

export function Grid({ columns = 3, variant, className, children }: LayoutProps) {
  return (
    <div className={blockClass('grid', className)} {...variantData(variant)} {...columnsData(columns)}>
      {children}
    </div>
  );
}

export function Columns({ columns = 2, variant, className, children }: LayoutProps) {
  return (
    <div className={blockClass('columns', className)} {...variantData(variant)} {...columnsData(columns)}>
      {children}
    </div>
  );
}

export function Steps({ title, variant, className, children }: CommonBlockProps) {
  return (
    <section className={blockClass('steps', className)} {...variantData(variant)}>
      {title ? <h2 className="markdown-component__title">{title}</h2> : null}
      {children}
    </section>
  );
}
