import React from 'react';

export function useMarkdownTabs(
  rootRef: React.RefObject<HTMLElement | null>,
  dependencies: React.DependencyList,
) {
  const tabsId = React.useId();
  React.useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return undefined;
    }

    const cleanups: Array<() => void> = [];
    const tabBlocks = Array.from(root.querySelectorAll<HTMLElement>('.markdown-tabs'));

    tabBlocks.forEach((tabBlock, blockIndex) => {
      const tabs = Array.from(tabBlock.querySelectorAll<HTMLButtonElement>('.markdown-tabs__tab[data-tab]'));
      const panels = Array.from(tabBlock.querySelectorAll<HTMLElement>('.markdown-tabs__panel[data-tab]'));

      if (tabs.length === 0 || panels.length === 0) {
        return;
      }

      tabs.forEach((tab, index) => {
        tab.id ||= `${tabsId}-${blockIndex}-tab-${index}`;
        const panel = panels.find(item => item.dataset.tab === tab.dataset.tab);
        if (panel) {
          panel.id ||= `${tabsId}-${blockIndex}-panel-${index}`;
          tab.setAttribute('aria-controls', panel.id);
          panel.setAttribute('aria-labelledby', tab.id);
        }
      });

      const activate = (tabId: string) => {
        tabs.forEach((tab) => {
          const active = tab.dataset.tab === tabId;
          tab.classList.toggle('markdown-tabs__tab--active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
          tab.tabIndex = active ? 0 : -1;
        });

        panels.forEach((panel) => {
          panel.classList.toggle('markdown-tabs__panel--active', panel.dataset.tab === tabId);
          panel.hidden = panel.dataset.tab !== tabId;
        });
      };

      tabs.forEach((tab) => {
        const handleClick = () => activate(tab.dataset.tab ?? '');

        const handleKeyDown = (event: KeyboardEvent) => {
          const index = tabs.indexOf(tab);
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          activate(tabs[next].dataset.tab ?? '');
          tabs[next].focus();
        };
        tab.addEventListener('click', handleClick);
        tab.addEventListener('keydown', handleKeyDown);
        cleanups.push(() => {
          tab.removeEventListener('click', handleClick);
          tab.removeEventListener('keydown', handleKeyDown);
        });
      });

      const activeTab = tabs.find((tab) => tab.classList.contains('markdown-tabs__tab--active')) ?? tabs[0];
      activate(activeTab.dataset.tab ?? '');
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, dependencies);
}

export function useMarkdownVideoEmbeds(
  rootRef: React.RefObject<HTMLElement | null>,
  dependencies: React.DependencyList,
) {
  React.useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return undefined;
    }

    const cleanups: Array<() => void> = [];
    const videos = Array.from(root.querySelectorAll<HTMLElement>('.docs-video[data-video-src]'));

    videos.forEach((video) => {
      const button = video.querySelector<HTMLButtonElement>('.docs-video__load');

      if (button === null) {
        return;
      }

      const handleClick = () => loadVideoEmbed(video);

      button.addEventListener('click', handleClick);
      cleanups.push(() => button.removeEventListener('click', handleClick));
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, dependencies);
}

function loadVideoEmbed(video: HTMLElement) {
  const src = video.dataset.videoSrc ?? '';

  if (src === '' || video.querySelector('iframe') !== null) {
    return;
  }

  const frame = video.querySelector<HTMLElement>('.docs-video__frame');

  if (frame === null) {
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = video.dataset.videoTitle ?? 'Video';
  iframe.loading = 'lazy';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';

  frame.replaceChildren(iframe);
}
