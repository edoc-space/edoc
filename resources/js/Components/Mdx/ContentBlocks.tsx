import React from 'react';
import { CommonBlockProps } from './types';
import { Action, blockClass, variantData } from './utils';

export function Feature({ title, icon, href, label, variant, className, children }: CommonBlockProps) {
  return (
    <article className={blockClass('feature', className)} {...variantData(variant)}>
      {icon ? <span className="markdown-component__icon">{icon}</span> : null}
      {title ? <h3 className="markdown-component__title">{title}</h3> : null}
      {children}
      <Action href={href} label={label} />
    </article>
  );
}

export function Card({ title, icon, href, label, variant, className, children }: CommonBlockProps) {
  return (
    <article className={blockClass('card', className)} {...variantData(variant)}>
      {icon ? <span className="markdown-component__icon">{icon}</span> : null}
      {title ? <h3 className="markdown-component__title">{title}</h3> : null}
      {children}
      <Action href={href} label={label} />
    </article>
  );
}

export function Cta({ title, href, label, variant, className, children }: CommonBlockProps) {
  return (
    <section className={blockClass('cta', className)} {...variantData(variant)}>
      {title ? <h2>{title}</h2> : null}
      {children}
      <Action href={href} label={label} />
    </section>
  );
}

export function Accordion({ title = 'Подробнее', children, className, variant, open = false }: CommonBlockProps & { open?: boolean }) {
  return (
    <details className={`${blockClass('accordion', className)} markdown-accordion`} {...variantData(variant)} open={open}>
      <summary className="markdown-accordion__summary">{title}</summary>
      <div className="markdown-accordion__content">{children}</div>
    </details>
  );
}
