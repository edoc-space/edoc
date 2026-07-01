import React from 'react';

const STORAGE_PREFIX = 'edoc.page.scroll.v1';
const RESTORE_DELAYS = [0, 40, 120, 260, 520, 900, 1400, 2200];

let reloadRestorePageKey: string | null = null;
let reloadRestoreConsumed = false;

export function usePageScrollRestoration(pageKey: string) {
  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const storageKey = `${STORAGE_PREFIX}.${pageKey}`;
    const previousScrollRestoration = window.history.scrollRestoration;
    const timeoutIds: number[] = [];
    let restoreCancelled = false;
    let frameId = 0;
    window.history.scrollRestoration = 'manual';
    const shouldRestoreSavedScroll = canRestoreSavedScrollAfterReload(pageKey);

    const saveScroll = () => {
      window.sessionStorage.setItem(storageKey, String(Math.max(0, Math.round(window.scrollY))));
    };

    const cancelRestore = () => {
      restoreCancelled = true;
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIds.length = 0;
    };

    const scheduleRestore = (restore: () => boolean) => {
      RESTORE_DELAYS.forEach((delay) => {
        const timeoutId = window.setTimeout(() => {
          if (restoreCancelled) {
            return;
          }

          restore();
        }, delay);

        timeoutIds.push(timeoutId);
      });
    };

    const restoreHash = () => {
      const hashId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (hashId === '') {
        return false;
      }

      const target = document.getElementById(hashId);
      if (target === null) {
        return false;
      }

      target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });

      return true;
    };

    const savedScrollY = Number(window.sessionStorage.getItem(storageKey) ?? 0);
    if (window.location.hash !== '') {
      scheduleRestore(restoreHash);
    } else if (shouldRestoreSavedScroll && Number.isFinite(savedScrollY) && savedScrollY > 0) {
      scheduleRestore(() => {
        window.scrollTo({ top: savedScrollY, left: 0, behavior: 'auto' });

        return true;
      });
    } else {
      window.requestAnimationFrame(() => {
        if (!restoreCancelled) {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
      });
    }

    const scheduleSave = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        saveScroll();
      });
    };

    const handleHashChange = () => {
      cancelRestore();
      window.requestAnimationFrame(() => {
        restoreHash();
        saveScroll();
      });
    };

    window.addEventListener('scroll', scheduleSave, { passive: true });
    window.addEventListener('pagehide', saveScroll);
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('pointerdown', cancelRestore);
    window.addEventListener('wheel', cancelRestore, { passive: true });
    window.addEventListener('touchstart', cancelRestore, { passive: true });
    window.addEventListener('keydown', cancelRestore);

    return () => {
      cancelRestore();

      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      window.history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener('scroll', scheduleSave);
      window.removeEventListener('pagehide', saveScroll);
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('pointerdown', cancelRestore);
      window.removeEventListener('wheel', cancelRestore);
      window.removeEventListener('touchstart', cancelRestore);
      window.removeEventListener('keydown', cancelRestore);
    };
  }, [pageKey]);
}

function canRestoreSavedScrollAfterReload(pageKey: string): boolean {
  if (!isReloadNavigation()) {
    return false;
  }

  if (reloadRestorePageKey === null) {
    reloadRestorePageKey = pageKey;

    window.setTimeout(() => {
      reloadRestoreConsumed = true;
    }, 0);
  }

  return reloadRestorePageKey === pageKey && !reloadRestoreConsumed;
}

function isReloadNavigation(): boolean {
  const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (navigation !== undefined) {
    return navigation.type === 'reload';
  }

  return window.performance.navigation?.type === window.performance.navigation?.TYPE_RELOAD;
}
