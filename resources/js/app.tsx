import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import { initTheme } from '@phpsoftbox/react-softbox';
import type { ComponentType } from 'react';
import '@phpsoftbox/react-softbox/foundations/index.css';
import './styles.css';

initTheme({ defaultMode: 'light' });

const pages = import.meta.glob('./Pages/Web/**/*.tsx', { eager: true }) as Record<
  string,
  { default: ComponentType }
>;

createInertiaApp({
  resolve: (name) => {
    const page = pages[`./Pages/${name}.tsx`];
    if (!page) {
      throw new Error(`Page "${name}" not found.`);
    }
    return page.default;
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },
});
