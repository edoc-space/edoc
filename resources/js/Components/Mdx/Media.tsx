import React from 'react';
import type { GalleryProps, VideoProvider, VideoProps } from './types';

type VideoEmbed = {
  provider: string;
  src: string;
  title: string;
};

export function Gallery({ id, children, className }: GalleryProps) {
  return (
    <div className={['markdown-gallery', className].filter(Boolean).join(' ')} data-gallery={id}>
      {children}
    </div>
  );
}

export function Video({ provider, hash = '', id = '', src = '', title = '', className }: VideoProps) {
  const [loaded, setLoaded] = React.useState(false);
  const rawSource = id || src;
  const source = extractIframeSource(rawSource) ?? rawSource;
  const embed = videoEmbed(provider, source, hash);

  if (embed === null) {
    if ((provider === 'vk' || provider === 'vkvideo') && source !== '') {
      return (
        <figure className={['docs-video', 'markdown-video', 'docs-video--external', className].filter(Boolean).join(' ')} data-provider="vkvideo">
          <div className="docs-video__frame">
            <a className="docs-video__external" href={source} target="_blank" rel="nofollow noopener noreferrer">
              <span className="docs-video__load-provider">VK Video</span>
              <span className="docs-video__load-title">{title || 'VK Video'}</span>
              <span className="docs-video__load-action">Открыть видео</span>
            </a>
          </div>
          <figcaption className="docs-video__caption">Для встраивания VK Video используйте src из iframe, который VK показывает в "Поделиться" / "Вставить".</figcaption>
        </figure>
      );
    }

    return null;
  }

  const label = title || embed.title;

  return (
    <figure className={['docs-video', 'markdown-video', className].filter(Boolean).join(' ')} data-provider={embed.provider}>
      <div className="docs-video__frame">
        {loaded ? (
          <iframe
            src={embed.src}
            title={label}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" className="docs-video__load" aria-label={`Загрузить видео: ${label}`} onClick={() => setLoaded(true)}>
            <span className="docs-video__load-provider">{providerLabel(embed.provider)}</span>
            <span className="docs-video__load-title">{label}</span>
            <span className="docs-video__load-action">Загрузить видео</span>
          </button>
        )}
      </div>
      {title ? <figcaption className="docs-video__caption">{title}</figcaption> : null}
    </figure>
  );
}

function videoEmbed(provider: VideoProvider, source: string, hash = ''): VideoEmbed | null {
  switch (provider) {
    case 'youtube':
      return youtubeEmbed(source);
    case 'rutube':
      return rutubeEmbed(source);
    case 'vk':
    case 'vkvideo':
      return vkVideoEmbed(source, hash);
    default:
      return null;
  }
}

function youtubeEmbed(source: string): VideoEmbed | null {
  let id = /^[A-Za-z0-9_-]{6,}$/.test(source) ? source : '';

  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();

    if (!id && hostMatches(host, 'youtu.be')) {
      id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    }

    if (!id && hostMatches(host, 'youtube.com')) {
      id = url.searchParams.get('v') ?? '';

      if (!id) {
        const match = url.pathname.replace(/^\/+/, '').match(/^(?:embed|shorts)\/([^/?#]+)/);
        id = match?.[1] ?? '';
      }
    }
  } catch {
    // Plain video ids are handled before URL parsing.
  }

  if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) {
    return null;
  }

  return {
    provider: 'youtube',
    src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
    title: 'YouTube video',
  };
}

function rutubeEmbed(source: string): VideoEmbed | null {
  let id = /^[A-Za-z0-9_-]{8,}$/.test(source) ? source : '';

  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();

    if (!hostMatches(host, 'rutube.ru')) {
      return null;
    }

    const segments = url.pathname.split('/').filter(Boolean);

    if (!id && segments[0] === 'video' && segments[1]) {
      id = segments[1];
    }

    if (!id && segments[0] === 'play' && segments[1] === 'embed' && segments[2]) {
      id = segments[2];
    }

    if (!id && segments[0] === 'shorts' && segments[1]) {
      id = segments[1];
    }
  } catch {
    // Plain video ids are handled before URL parsing.
  }

  if (!/^[A-Za-z0-9_-]{8,}$/.test(id)) {
    return null;
  }

  return {
    provider: 'rutube',
    src: `https://rutube.ru/play/embed/${encodeURIComponent(id)}`,
    title: 'RuTube video',
  };
}

function vkVideoEmbed(source: string, hash = ''): VideoEmbed | null {
  let oid = '';
  let id = '';
  let hd = '';
  let explicitEmbedUrl = false;
  const directMatch = source.match(/^(?:video)?(-?\d+)_(\d+)$/);

  if (directMatch) {
    oid = directMatch[1];
    id = directMatch[2];
  }

  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();

    if (!hostMatches(host, 'vk.com') && !hostMatches(host, 'vkvideo.ru')) {
      return null;
    }

    explicitEmbedUrl = url.pathname.replace(/^\/+/, '') === 'video_ext.php';

    const queryOid = url.searchParams.get('oid') ?? '';
    const queryId = url.searchParams.get('id') ?? '';

    if (!oid && !id && queryOid && queryId) {
      oid = queryOid;
      id = queryId;
      hash ||= url.searchParams.get('hash') ?? '';
      hd = url.searchParams.get('hd') ?? '';
    }

    if (!oid && !id) {
      const pathMatch = url.pathname.match(/(?:^|\/)video(-?\d+)_(\d+)/);
      oid = pathMatch?.[1] ?? '';
      id = pathMatch?.[2] ?? '';
    }
  } catch {
    // Plain video ids are handled before URL parsing.
  }

  if (!/^-?\d+$/.test(oid) || !/^\d+$/.test(id)) {
    return null;
  }

  if (hash && !/^[A-Za-z0-9_.-]{4,}$/.test(hash)) {
    return null;
  }

  if (hd && !/^[0-9]$/.test(hd)) {
    return null;
  }

  if (!explicitEmbedUrl && !hash) {
    return null;
  }

  const query = new URLSearchParams({ oid, id });

  if (hash) {
    query.set('hash', hash);
  }

  if (hd) {
    query.set('hd', hd);
  }

  return {
    provider: 'vkvideo',
    src: `https://vkvideo.ru/video_ext.php?${query.toString()}`,
    title: 'VK Video',
  };
}

function extractIframeSource(value: string): string | null {
  const match = value.match(/<iframe\b[^>]*\bsrc=(["'])(.*?)\1/i);

  return match?.[2] ?? null;
}

function providerLabel(provider: string): string {
  switch (provider) {
    case 'youtube':
      return 'YouTube';
    case 'rutube':
      return 'RuTube';
    case 'vkvideo':
      return 'VK Video';
    default:
      return 'Video';
  }
}

function hostMatches(host: string, expected: string): boolean {
  return host === expected || host.endsWith(`.${expected}`);
}
