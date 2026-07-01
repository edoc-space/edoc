import React from 'react';
import { TestimonialProps } from './types';
import { blockClass, variantData } from './utils';

export function Testimonial({ author, role, company, avatar, variant, className, children }: TestimonialProps) {
  return (
    <figure className={blockClass('testimonial', className)} {...variantData(variant)}>
      {avatar ? <img className="markdown-testimonial__avatar" src={avatar} alt="" /> : null}
      <blockquote>{children}</blockquote>
      {(author || role || company) ? (
        <figcaption className="markdown-testimonial__footer">
          {author ? <strong>{author}</strong> : null}
          {[role, company].filter(Boolean).join(', ')}
        </figcaption>
      ) : null}
    </figure>
  );
}
