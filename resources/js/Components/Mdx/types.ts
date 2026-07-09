import React from 'react';

export type BlockProps = {
  children?: React.ReactNode;
  className?: string;
  variant?: string;
};

export type ActionProps = {
  href?: string;
  label?: string;
};

export type HeroProps = BlockProps & ActionProps & {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export type SectionProps = BlockProps & {
  title?: string;
  eyebrow?: string;
};

export type LayoutProps = BlockProps & {
  columns?: number | string;
};

export type CommonBlockProps = BlockProps & ActionProps & {
  title?: string;
  icon?: string;
};

export type TestimonialProps = BlockProps & {
  author?: string;
  role?: string;
  company?: string;
  avatar?: string;
};

export type SliderImage = {
  src: string;
  alt?: string;
};

export type SliderProps = BlockProps & {
  title?: string;
  images?: SliderImage[];
};

export type GalleryProps = BlockProps & {
  id: string;
};

export type VideoProvider = 'youtube' | 'rutube' | 'vkvideo' | 'vk';

export type VideoProps = BlockProps & {
  provider: VideoProvider;
  hash?: string;
  id?: string;
  src?: string;
  title?: string;
};

export type HelpSearchProvider = 'static' | 'api';

export type HelpCenterProps = BlockProps & {
  title?: string;
  subtitle?: string;
  searchProvider?: HelpSearchProvider | {
    type?: HelpSearchProvider;
    endpoint?: string;
  };
  searchEndpoint?: string;
  searchPlaceholder?: string;
};

export type HelpSectionProps = BlockProps & {
  title?: string;
  eyebrow?: string;
  columns?: number | string;
};

export type HelpLinkProps = BlockProps & {
  href: string;
  title?: string;
  icon?: string;
  description?: string;
};

export type HelpFaqProps = BlockProps & {
  question: string;
  href?: string;
};
