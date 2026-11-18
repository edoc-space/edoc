import React from 'react';
import { Tabs as UiTabs } from '@phpsoftbox/react-softbox';
import { BlockProps } from './types';

type TabProps = BlockProps & { title?: string; disabled?: boolean };
type TabsProps = BlockProps & { label?: string; defaultIndex?: number };

/** Author-friendly children API over the shared keyboard-accessible UI-kit. */
export function Tabs({ children, className, label = 'Tabs', defaultIndex = 0 }: TabsProps) {
  const root = React.useRef<HTMLDivElement>(null);
  const tabs = React.Children.toArray(children).filter((child): child is React.ReactElement<TabProps> =>
    React.isValidElement<TabProps>(child) && child.type === Tab);
  const items = tabs.map((child, index) => ({
    id: String(index), label: child.props.title ?? String(index + 1),
    content: child.props.children, disabled: child.props.disabled,
  }));
  React.useLayoutEffect(() => {
    // UI-kit 2.8.3 exposes no tablist aria props; scope the adapter to this instance.
    root.current?.querySelector('[role="tablist"]')?.setAttribute('aria-label', label);
  }, [label]);
  return <div ref={root} className={['markdown-tabs', 'markdown-tabs--ui', className].filter(Boolean).join(' ')}>
    <UiTabs items={items} defaultActiveId={String(defaultIndex)} />
  </div>;
}

export function Tab({ title, children }: TabProps) {
  return <section className="markdown-tabs__panel markdown-tabs__panel--active">
    {title ? <h3>{title}</h3> : null}{children}
  </section>;
}
