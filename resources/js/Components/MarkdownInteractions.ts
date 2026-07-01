import React from 'react';

export function useMarkdownTabs(
  rootRef: React.RefObject<HTMLElement | null>,
  dependencies: React.DependencyList,
) {
  React.useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return undefined;
    }

    const cleanups: Array<() => void> = [];
    const tabBlocks = Array.from(root.querySelectorAll<HTMLElement>('.markdown-tabs'));

    tabBlocks.forEach((tabBlock) => {
      const tabs = Array.from(tabBlock.querySelectorAll<HTMLButtonElement>('.markdown-tabs__tab[data-tab]'));
      const panels = Array.from(tabBlock.querySelectorAll<HTMLElement>('.markdown-tabs__panel[data-tab]'));

      if (tabs.length === 0 || panels.length === 0) {
        return;
      }

      const activate = (tabId: string) => {
        tabs.forEach((tab) => {
          const active = tab.dataset.tab === tabId;
          tab.classList.toggle('markdown-tabs__tab--active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        panels.forEach((panel) => {
          panel.classList.toggle('markdown-tabs__panel--active', panel.dataset.tab === tabId);
        });
      };

      tabs.forEach((tab) => {
        const handleClick = () => activate(tab.dataset.tab ?? '');

        tab.addEventListener('click', handleClick);
        cleanups.push(() => tab.removeEventListener('click', handleClick));
      });

      const activeTab = tabs.find((tab) => tab.classList.contains('markdown-tabs__tab--active')) ?? tabs[0];
      activate(activeTab.dataset.tab ?? '');
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, dependencies);
}
