declare module 'shiki/langs/*.mjs' {
  import type { LanguageRegistration } from '@shikijs/core';

  const language: LanguageRegistration[];
  export default language;
}

declare module 'shiki/themes/*.mjs' {
  import type { ThemeRegistrationRaw } from '@shikijs/core';

  const theme: ThemeRegistrationRaw;
  export default theme;
}
