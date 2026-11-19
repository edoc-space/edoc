import type { SiteTheme, ThemeSlots } from '../../resources/js/Themes/contract';

const partial: SiteTheme = { contractVersion: 1, slots: { Header: (props) => {
  props.navigation.map((item) => item.href);
  return null;
} } };
void partial;
// @ts-expect-error Only the supported contract version can be exported.
const future: SiteTheme = { contractVersion: 2 };
void future;
// @ts-expect-error A page replacement must receive the domain's page props.
const incomplete: import('react').ComponentProps<ThemeSlots['Page']> = { title: 'No content' };
void incomplete;
