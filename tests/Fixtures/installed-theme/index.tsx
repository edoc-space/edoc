import React from 'react';
import type { SiteTheme } from '@/Themes/contract';

// A contract fixture, without a second visual design or private site imports.
export default {
  contractVersion: 1,
  slots: { Header: ({ navigation }) => <header data-installed-theme="fixture">{navigation.map((item) => (
    <a key={item.href} href={item.href}>{item.label ?? item.title}</a>
  ))}</header> },
} satisfies SiteTheme;
