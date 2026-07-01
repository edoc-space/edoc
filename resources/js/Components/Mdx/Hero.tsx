import React from 'react';
import { HeroProps } from './types';
import { MdxLayoutContext } from './context';
import { Action, blockClass, variantData } from './utils';

export function Hero({
  title,
  eyebrow,
  subtitle,
  href,
  label,
  secondaryHref,
  secondaryLabel,
  variant,
  className,
  children,
}: HeroProps) {
  const { heroBefore } = React.useContext(MdxLayoutContext);

  return (
    <section className={blockClass('hero', className)} {...variantData(variant)}>
      <div className="markdown-hero__content">
        {heroBefore ? <div className="markdown-hero__before">{heroBefore}</div> : null}
        {eyebrow ? <p className="markdown-hero__eyebrow">{eyebrow}</p> : null}
        {title ? <h1 className="markdown-hero__title">{title}</h1> : null}
        {subtitle ? <p className="markdown-hero__subtitle">{subtitle}</p> : null}
        {children}
        {href || secondaryHref ? (
          <div className="markdown-hero__actions">
            <Action href={href} label={label} />
            <Action href={secondaryHref} label={secondaryLabel} variant="secondary" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
