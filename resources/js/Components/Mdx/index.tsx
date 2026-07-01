import { Accordion, Card, Cta, Feature } from './ContentBlocks';
import { Columns, Grid, Steps } from './Layout';
import { Hero } from './Hero';
import { MdxAnchor, MdxH1, MdxH2, MdxH3, MdxH4, MdxH5, MdxH6, MdxImage } from './MarkdownElements';
import { Section } from './Section';
import { Slider } from './Slider';
import { Tab, Tabs } from './Tabs';
import { Testimonial } from './Testimonial';

export { Accordion, Card, Cta, Feature } from './ContentBlocks';
export { Columns, Grid, Steps } from './Layout';
export { Hero } from './Hero';
export { Section } from './Section';
export { Slider } from './Slider';
export { Tab, Tabs } from './Tabs';
export { Testimonial } from './Testimonial';
export { MdxAnchor, MdxH1, MdxH2, MdxH3, MdxH4, MdxH5, MdxH6, MdxImage } from './MarkdownElements';
export type {
  ActionProps,
  BlockProps,
  CommonBlockProps,
  HeroProps,
  LayoutProps,
  SectionProps,
  SliderImage,
  SliderProps,
  TestimonialProps,
} from './types';

export const mdxComponents = {
  a: MdxAnchor,
  h1: MdxH1,
  h2: MdxH2,
  h3: MdxH3,
  h4: MdxH4,
  h5: MdxH5,
  h6: MdxH6,
  img: MdxImage,
  Accordion,
  Card,
  Columns,
  Cta,
  CTA: Cta,
  Feature,
  Grid,
  Hero,
  Intro: Hero,
  Section,
  Slider,
  Steps,
  Tab,
  Tabs,
  Testimonial,
  Testimonials: Testimonial,
};
