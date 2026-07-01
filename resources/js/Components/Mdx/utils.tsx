import React from 'react';
import { ActionProps } from './types';

export function blockClass(name: string, className?: string): string {
  return ['markdown-component', `markdown-component--${name}`, className].filter(Boolean).join(' ');
}

export function variantData(variant?: string) {
  return variant ? { 'data-variant': variant } : {};
}

export function columnsData(columns?: number | string) {
  return columns ? { 'data-columns': String(columns) } : {};
}

export function Action({ href, label, variant }: ActionProps & { variant?: 'primary' | 'secondary' }) {
  if (!href) {
    return null;
  }

  return (
    <a className="markdown-component__action" data-action-variant={variant ?? 'primary'} href={href}>
      {label || 'Подробнее'}
    </a>
  );
}
