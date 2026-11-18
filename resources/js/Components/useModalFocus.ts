import React from 'react';

const focusableSelector = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';
const modalStack: HTMLElement[] = [];
let bodyOverflow = '';

/** Shared focus lifecycle for portalled modal surfaces, including nested ones. */
export function useModalFocus(
  open: boolean,
  dialogId: string,
  initialFocus?: React.RefObject<HTMLElement | null>,
) {
  React.useEffect(() => {
    if (!open) return;
    const dialog = document.getElementById(dialogId);
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousTabIndex = dialog.getAttribute('tabindex');
    dialog.tabIndex = -1;
    if (modalStack.length === 0) {
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    modalStack.push(dialog);

    const isTop = () => modalStack[modalStack.length - 1] === dialog;
    const stops = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled, [aria-disabled="true"]')
        && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0
        && window.getComputedStyle(element).visibility !== 'hidden');
    const focusInside = () => (initialFocus?.current ?? stops()[0] ?? dialog).focus({ preventScroll: true });
    const handleFocus = (event: FocusEvent) => {
      if (isTop() && event.target instanceof Node && !dialog.contains(event.target)) focusInside();
    };
    const handleTab = (event: KeyboardEvent) => {
      if (!isTop() || event.key !== 'Tab') return;
      const elements = stops();
      const current = elements.indexOf(document.activeElement as HTMLElement);
      if (elements.length === 0 || current < 0 || (event.shiftKey ? current === 0 : current === elements.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? elements[elements.length - 1] ?? dialog : elements[0] ?? dialog).focus({ preventScroll: true });
      }
    };
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('keydown', handleTab, true);
    focusInside();

    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('keydown', handleTab, true);
      const wasTop = isTop();
      modalStack.splice(modalStack.indexOf(dialog), 1);
      if (previousTabIndex === null) dialog.removeAttribute('tabindex');
      else dialog.setAttribute('tabindex', previousTabIndex);
      if (modalStack.length === 0) document.body.style.overflow = bodyOverflow;
      if (wasTop && previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
        // Softbox closes its backdrop on mousedown. The browser's default
        // action can blur the restored trigger after React runs this cleanup.
        // Repair that blur after the event, without stealing an intentional focus.
        window.requestAnimationFrame(() => {
          if (previousFocus.isConnected && document.activeElement === document.body) {
            previousFocus.focus({ preventScroll: true });
          }
        });
      }
    };
  }, [open, dialogId, initialFocus]);
}
