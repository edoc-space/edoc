import React from 'react';
import { Drawer as SoftboxDrawer } from '@phpsoftbox/react-softbox';
import { useModalFocus } from './useModalFocus';

/** Keep Softbox rendering/close behavior; its v2 API exposes id, but no focus API. */
export function Drawer(props: React.ComponentProps<typeof SoftboxDrawer>) {
  const generatedId = React.useId();
  const id = props.id ?? generatedId;
  React.useEffect(() => {
    if (!props.open) return;
    const dialog = document.getElementById(id);
    // Softbox v2 supports id/title, but does not forward ARIA props. Keep its
    // existing visible heading and preserve any explicit accessible name.
    if (!dialog || dialog.getAttribute('role') !== 'dialog'
      || dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby')) return;
    const heading = dialog.querySelector<HTMLElement>(':scope > header > h3');
    if (!heading) return;
    const originalId = heading.id;
    const titleId = originalId || `${generatedId}-title`;
    heading.id = titleId;
    dialog.setAttribute('aria-labelledby', titleId);
    return () => {
      if (dialog.getAttribute('aria-labelledby') === titleId) dialog.removeAttribute('aria-labelledby');
      if (!originalId && heading.id === titleId) heading.removeAttribute('id');
    };
  }, [props.open, props.title, props.mode, props.showHeader, props.showClose, id, generatedId]);
  useModalFocus(props.open && props.mode !== 'inline', id);
  return <SoftboxDrawer {...props} id={id} />;
}
