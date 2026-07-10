import React from 'react';
import type { SiteLocaleItem, SiteUiText } from '../../Layouts/SiteLayout';

export type MdxLayoutContextValue = {
  heroBefore?: React.ReactNode;
  locale?: SiteLocaleItem;
  ui?: SiteUiText;
};

export const MdxLayoutContext = React.createContext<MdxLayoutContextValue>({});

export type MdxHeadingContextValue = {
  resolveHeadingId: (title: string) => string;
};

export function createMdxHeadingContext(): MdxHeadingContextValue {
  const ids = new Map<string, number>();

  return {
    resolveHeadingId(title: string): string {
      const base = slugMdxHeading(title);
      const count = (ids.get(base) ?? 0) + 1;
      ids.set(base, count);

      return count === 1 ? base : `${base}-${count}`;
    },
  };
}

export function slugMdxHeading(title: string): string {
  const slug = title
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug !== '' ? slug : 'section';
}

export const MdxHeadingContext = React.createContext<MdxHeadingContextValue>({
  resolveHeadingId: slugMdxHeading,
});
