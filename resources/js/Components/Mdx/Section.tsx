import React from 'react';
import { SectionProps } from './types';
import { blockClass, variantData } from './utils';

export function Section({ title, eyebrow, variant, className, children }: SectionProps) {
  return (
    <section className={blockClass('section', className)} {...variantData(variant)}>
      {eyebrow ? <p className="markdown-section__eyebrow">{eyebrow}</p> : null}
      {title ? <h2 className="markdown-component__title">{title}</h2> : null}
      {children}
    </section>
  );
}
