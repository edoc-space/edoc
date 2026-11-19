import React from 'react';
import { Card, Filters, LatestArticles } from '../../resources/js/Components/Mdx';
const card = <Card title="A public record" headingLevel={2} href="/detail" linkPlacement="title"
  metadata={<time dateTime="2026-11-01">November</time>} media={<img alt="" src="/public.svg" />}
  actions={<><a href="/other">Other action</a><button>Local operation</button></>}><p>Content</p></Card>;
const local = <Filters label="Status" value="all" options={[{ value: 'all', label: 'All' }]} onChange={value => value.toUpperCase()} />;
const server = <Filters mode="navigation" label="Tag" value="php" options={[{ value: 'php', label: 'PHP', href: '/blog/tags/php' }]} />;
// @ts-expect-error Local filtering requires a state owner.
const missingOwner = <Filters label="Status" value="all" options={[]} />;
// @ts-expect-error Navigation keeps selection with the server, no local callback.
const duplicatedOwner = <Filters mode="navigation" label="Tag" value="php" options={[]} onChange={() => {}} />;
void [card, local, server, missingOwner, duplicatedOwner, <LatestArticles />];

const entrance = <Card title="Blog" href="/blog" linkPlacement="card"><p>Read articles.</p></Card>;
// @ts-expect-error Whole-card links need a destination.
const missingDestination = <Card title="Blog" linkPlacement="card" />;
// @ts-expect-error Whole-card links cannot contain separate actions.
const nestedActions = <Card title="Blog" href="/blog" linkPlacement="card" actions={<button>Other</button>} />;
void [entrance, missingDestination, nestedActions];
