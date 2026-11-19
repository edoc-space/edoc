import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import { initTheme } from '@phpsoftbox/react-softbox';
import '@phpsoftbox/react-softbox/foundations/index.css';
import './styles.css';
import './Themes/default/theme.css';
import selectedTheme from 'virtual:edoc-theme';
import { configureTheme, themeSlots } from './Themes/runtime';

configureTheme(selectedTheme);

initTheme({ defaultMode: 'light' });

createInertiaApp({
  resolve: (name) => {
    const slots = themeSlots();
    switch (name) {
      case 'Web/Blog/List': return slots.BlogList;
      case 'Web/Blog/Article': return slots.BlogArticle;
      case 'Web/Page/Show': return slots.Page;
      case 'Web/Documentation/Show': return slots.Documentation;
      case 'Web/Error/Show': return slots.Error;
      default: throw new Error(`Page "${name}" not found.`);
    }
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },
});
