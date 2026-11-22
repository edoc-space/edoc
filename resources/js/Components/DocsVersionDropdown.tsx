import React from 'react';
import { Dropdown } from '@phpsoftbox/react-softbox';
import type { SiteUiText } from '../Layouts/SiteLayout';

export type DocumentationVersionItem = {
  version: string;
  label: string;
  status: 'current' | 'supported' | 'archived' | string;
  href?: string;
  docs_enabled?: boolean;
  current?: boolean;
  archived_at?: string;
  released_at?: string;
};

export type DocumentationVersions = {
  enabled?: boolean;
  current?: string;
  selected?: DocumentationVersionItem | null;
  all_href?: string;
  items?: DocumentationVersionItem[];
};

export type DocsVersionDropdownProps = {
  versions?: DocumentationVersions;
  ui: SiteUiText;
  align?: 'left' | 'right';
};

export function DocsVersionDropdown({ versions, ui, align = 'right' }: DocsVersionDropdownProps) {
  const items = (versions?.items ?? []).filter((item) => item.docs_enabled === true && Boolean(item.href));
  const selected = versions?.selected ?? items.find((item) => item.current) ?? items[0] ?? null;

  if (versions?.enabled !== true || selected === null || items.length === 0) {
    return null;
  }

  return (
    <Dropdown
      align={align}
      placement="down"
      className="docs-version-dropdown"
      triggerClassName="docs-version-trigger"
      triggerAriaLabel={ui.versionsLabel ?? 'Версия документации'}
      trigger={[
        <span key="label" className="docs-version-current">{selected.label}</span>,
        <span key="caret" className="docs-version-caret" aria-hidden="true" />,
      ]}
    >
      <Dropdown.Nav className="docs-version-menu">
        {items.map((item) => (
          <Dropdown.Item
            key={item.version}
            href={item.current ? undefined : item.href}
            className={`docs-version-menu-item${item.current ? ' docs-version-menu-item-current' : ''}`}
          >
            {item.label}
          </Dropdown.Item>
        ))}
        {versions?.all_href ? (
          <>
            <Dropdown.Separator />
            <Dropdown.Item href={versions.all_href} className="docs-version-menu-all">
              {ui.allVersions ?? 'Все версии'}
            </Dropdown.Item>
          </>
        ) : null}
      </Dropdown.Nav>
    </Dropdown>
  );
}

