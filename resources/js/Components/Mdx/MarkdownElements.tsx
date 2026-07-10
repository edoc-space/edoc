import React from 'react';
import { MdxHeadingContext } from './context';

type MdxHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type MdxHeadingProps = React.HTMLAttributes<HTMLHeadingElement> & {
  level: MdxHeadingLevel;
};

export function MdxImage({ src = '', alt = '', title, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const resolvedSrc = typeof src === 'string' && src !== '' && !src.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(src)
    ? `/storage/edoc/static/${src}`
    : src;
  const caption = typeof title === 'string' && title.trim() !== '' ? title : alt;

  return (
    <span className="docs-image">
      <img {...props} src={resolvedSrc} alt={alt} title={title} />
      {caption ? <span className="docs-image__caption">{caption}</span> : null}
    </span>
  );
}

export function MdxAnchor({ href = '', children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');

  return (
    <a {...props} href={href} target={external ? '_blank' : props.target} rel={external ? 'nofollow noopener noreferrer' : props.rel}>
      {children}
    </a>
  );
}

export function MdxHeading({ level, children, id, ...props }: MdxHeadingProps) {
  const { resolveHeadingId } = React.useContext(MdxHeadingContext);
  const headingId = id ?? resolveHeadingId(reactNodeText(children));

  return React.createElement(`h${level}`, { ...props, id: headingId }, children);
}

export function MdxH1(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <MdxHeading {...props} level={1} />;
}

export function MdxH2(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <MdxHeading {...props} level={2} />;
}

export function MdxH3(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <MdxHeading {...props} level={3} />;
}

export function MdxH4(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <MdxHeading {...props} level={4} />;
}

export function MdxH5(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <MdxHeading {...props} level={5} />;
}

export function MdxH6(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <MdxHeading {...props} level={6} />;
}

function reactNodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(reactNodeText).join('');
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return reactNodeText(node.props.children);
  }

  return '';
}
