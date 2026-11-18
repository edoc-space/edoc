import { defaultSlots } from './default';
import type { SiteTheme, ThemeSlots } from './contract';

let slots: ThemeSlots;

export function configureTheme(theme: SiteTheme) {
  if (theme?.contractVersion !== 1) {
    throw new Error('theme.incompatible: Theme export must implement contract v1.');
  }
  slots = { ...defaultSlots };
  for (const key of Object.keys(defaultSlots) as (keyof ThemeSlots)[]) {
    const component = theme.slots?.[key];
    if (component !== undefined) {
      if (typeof component !== 'function' && (typeof component !== 'object' || component === null)) {
        throw new Error(`theme.invalid: Invalid ${key} component.`);
      }
      // Each public key has its own typed props; runtime only copies trusted exports.
      Object.assign(slots, { [key]: component });
    }
  }
}

export function themeSlots(): ThemeSlots {
  return slots ?? defaultSlots;
}
