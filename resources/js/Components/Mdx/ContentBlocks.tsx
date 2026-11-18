import React from 'react';
import { Card as UiCard } from '@phpsoftbox/react-softbox';
import { CardProps, CommonBlockProps } from './types';
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

export function Card({ title, icon, href, label, variant, className, children,
  metadata, media, actions, headingLevel = 3, linkPlacement = 'action' }: CardProps) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  const titleId = React.useId();
  const content = (
    <UiCard role="article" className={blockClass('card', className)} {...variantData(variant)}>
      {media ? <div className="markdown-card__media">{media}</div> : null}
      {metadata ? <div className="markdown-card__metadata">{metadata}</div> : null}
      {icon ? <span className="markdown-component__icon">{icon}</span> : null}
      {title ? <Heading id={titleId} className="markdown-component__title">{href && linkPlacement === 'title'
        ? <a href={href}>{title}</a> : title}</Heading> : null}
      <div className="markdown-card__content">{children}</div>
      {actions || (href && linkPlacement === 'action') ? <div className="markdown-card__actions">
        {linkPlacement === 'action' ? <Action href={href} label={label} /> : null}{actions}
      </div> : null}
      {linkPlacement === 'card' && label ? <span className="markdown-card__actions markdown-component__action">{label}</span> : null}
    </UiCard>
  );
  return linkPlacement === 'card'
    ? <a className="markdown-card-link" href={href} aria-labelledby={title ? titleId : undefined}>{content}</a>
    : content;
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
