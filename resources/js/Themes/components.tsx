import React from 'react';
import { themeSlots } from './runtime';
import type { SiteShellProps, SiteHeaderProps, SiteFooterProps } from './contract';

export function SiteShell(props: SiteShellProps) {
  const Component = themeSlots().SiteShell;
  return <Component {...props} />;
}
export function SiteHeader(props: SiteHeaderProps) {
  const Component = themeSlots().Header;
  return <Component {...props} />;
}
export function SiteFooter(props: SiteFooterProps) {
  const Component = themeSlots().Footer;
  return <Component {...props} />;
}
