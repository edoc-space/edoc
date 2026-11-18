declare module 'virtual:edoc-theme' {
  const theme: import('../Themes/contract').SiteTheme;
  export default theme;
}

declare module 'virtual:edoc-blog-abi' { const abi: string; export default abi; }
