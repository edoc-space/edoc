import React from 'react';
import { createPortal } from 'react-dom';

type PreviewImage = {
  src: string;
  alt: string;
  caption: string;
  galleryId: string | null;
  element: HTMLImageElement;
};

type LightboxState = {
  images: PreviewImage[];
  index: number;
};

export function useMarkdownImagePreview(
  rootRef: React.RefObject<HTMLElement | null>,
  dependencies: React.DependencyList,
) {
  const [lightbox, setLightbox] = React.useState<LightboxState | null>(null);
  const triggerRef = React.useRef<HTMLImageElement | null>(null);
  const pointerStartRef = React.useRef<number | null>(null);

  const closeLightbox = React.useCallback(() => {
    const trigger = triggerRef.current;

    setLightbox(null);

    if (trigger !== null && document.contains(trigger)) {
      window.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
    }
  }, []);

  const showPrevious = React.useCallback(() => {
    setLightbox((current) => {
      if (current === null || current.images.length < 2) {
        return current;
      }

      return {
        ...current,
        index: (current.index + current.images.length - 1) % current.images.length,
      };
    });
  }, []);

  const showNext = React.useCallback(() => {
    setLightbox((current) => {
      if (current === null || current.images.length < 2) {
        return current;
      }

      return {
        ...current,
        index: (current.index + 1) % current.images.length,
      };
    });
  }, []);

  const openImage = React.useCallback((root: HTMLElement, image: HTMLImageElement) => {
    const galleryId = imageGalleryId(image);
    const images = collectPreviewImages(root).filter((item) => (
      galleryId === null ? item.element === image : item.galleryId === galleryId
    ));
    const index = images.findIndex((item) => item.element === image);

    if (images.length === 0 || index < 0) {
      return;
    }

    triggerRef.current = image;
    setLightbox({ images, index });
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;

    if (root === null) {
      return undefined;
    }

    const cleanups: Array<() => void> = [];
    const decorationCleanups = decorateMarkdownImages(root);
    const images = collectPreviewImages(root);

    images.forEach(({ element }) => {
      const previousRole = element.getAttribute('role');
      const previousTabIndex = element.getAttribute('tabindex');

      element.classList.add('markdown-preview-image');
      element.setAttribute('role', 'button');

      if (previousTabIndex === null) {
        element.setAttribute('tabindex', '0');
      }

      const handleOpen = (event: Event) => {
        event.preventDefault();
        openImage(root, element);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        openImage(root, element);
      };

      element.addEventListener('click', handleOpen);
      element.addEventListener('keydown', handleKeyDown);

      cleanups.push(() => {
        element.classList.remove('markdown-preview-image');
        element.removeEventListener('click', handleOpen);
        element.removeEventListener('keydown', handleKeyDown);

        if (previousRole === null) {
          element.removeAttribute('role');
        } else {
          element.setAttribute('role', previousRole);
        }

        if (previousTabIndex === null) {
          element.removeAttribute('tabindex');
        } else {
          element.setAttribute('tabindex', previousTabIndex);
        }
      });
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      decorationCleanups.forEach((cleanup) => cleanup());
    };
  }, [rootRef, openImage, ...dependencies]);

  React.useEffect(() => {
    if (lightbox === null) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showPrevious();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        showNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeLightbox, lightbox, showNext, showPrevious]);

  if (lightbox === null || typeof document === 'undefined') {
    return null;
  }

  const current = lightbox.images[lightbox.index] ?? lightbox.images[0];

  if (!current) {
    return null;
  }

  const hasMany = lightbox.images.length > 1;

  return createPortal(
    <div
      className="markdown-lightbox"
      role="presentation"
      onPointerDown={(event) => {
        pointerStartRef.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (pointerStartRef.current === null || !hasMany) {
          pointerStartRef.current = null;
          return;
        }

        const delta = event.clientX - pointerStartRef.current;
        pointerStartRef.current = null;

        if (Math.abs(delta) < 48) {
          return;
        }

        if (delta > 0) {
          showPrevious();
          return;
        }

        showNext();
      }}
    >
      <button type="button" className="markdown-lightbox__backdrop" aria-label="Закрыть просмотр" onClick={closeLightbox} />
      <div className="markdown-lightbox__dialog" data-has-many={hasMany ? 'true' : 'false'} role="dialog" aria-modal="true" aria-label="Просмотр изображения">
        <button type="button" className="markdown-lightbox__close" aria-label="Закрыть просмотр" onClick={closeLightbox}>
          <span aria-hidden="true" />
        </button>

        {hasMany ? (
          <button type="button" className="markdown-lightbox__nav markdown-lightbox__nav--prev" aria-label="Предыдущее изображение" onClick={showPrevious}>
            <span aria-hidden="true" />
          </button>
        ) : null}

        <figure className="markdown-lightbox__figure">
          <img src={current.src} alt={current.alt} className="markdown-lightbox__image" />
          {current.caption || hasMany ? (
            <figcaption className="markdown-lightbox__caption">
              {current.caption ? <span>{current.caption}</span> : <span />}
              {hasMany ? <span>{lightbox.index + 1} / {lightbox.images.length}</span> : null}
            </figcaption>
          ) : null}
        </figure>

        {hasMany ? (
          <button type="button" className="markdown-lightbox__nav markdown-lightbox__nav--next" aria-label="Следующее изображение" onClick={showNext}>
            <span aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function collectPreviewImages(root: HTMLElement): PreviewImage[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>('img'))
    .filter(isPreviewableImage)
    .map((element) => ({
      src: element.currentSrc || element.src,
      alt: element.getAttribute('alt') ?? '',
      caption: imageCaption(element),
      galleryId: imageGalleryId(element),
      element,
    }))
    .filter((image) => image.src !== '');
}

function isPreviewableImage(image: HTMLImageElement): boolean {
  if (image.dataset.preview === 'false') {
    return false;
  }

  if (image.closest('a, button, .docs-video, .markdown-testimonial__avatar')) {
    return false;
  }

  return (image.currentSrc || image.src) !== '';
}

function decorateMarkdownImages(root: HTMLElement): Array<() => void> {
  const cleanups: Array<() => void> = [];
  const containers = Array.from(root.querySelectorAll<HTMLParagraphElement>('p')).filter(isImageOnlyContainer);

  containers.forEach((container) => {
    const images = Array.from(container.children).filter((child): child is HTMLImageElement => child instanceof HTMLImageElement);

    if (images.length === 0) {
      return;
    }

    if (images.length === 1) {
      const image = images[0];
      const hadClass = container.classList.contains('docs-image');
      const caption = createImageCaption(image);

      container.classList.add('docs-image');

      if (caption !== null) {
        container.append(caption);
      }

      cleanups.push(() => {
        caption?.remove();

        if (!hadClass) {
          container.classList.remove('docs-image');
        }
      });

      return;
    }

    images.forEach((image) => {
      const cleanup = wrapStandaloneImage(image);

      if (cleanup !== null) {
        cleanups.push(cleanup);
      }
    });
  });

  const standaloneImages = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
    .filter(isDecoratableImage)
    .filter((image) => shouldWrapStandaloneImage(root, image));

  standaloneImages.forEach((image) => {
    const cleanup = wrapStandaloneImage(image);

    if (cleanup !== null) {
      cleanups.push(cleanup);
    }
  });

  return cleanups;
}

function isImageOnlyContainer(container: HTMLElement): boolean {
  let images = 0;

  return Array.from(container.childNodes).every((node) => {
    if (node instanceof HTMLImageElement && isDecoratableImage(node)) {
      images++;
      return true;
    }

    return node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() === '';
  }) && images > 0;
}

function isDecoratableImage(image: HTMLImageElement): boolean {
  if (image.closest('a, button, .docs-video, .markdown-testimonial__avatar, .docs-image')) {
    return false;
  }

  return image.parentElement !== null;
}

function createImageCaption(image: HTMLImageElement): HTMLSpanElement | null {
  const captionText = imageCaption(image);

  if (captionText === '') {
    return null;
  }

  const caption = document.createElement('span');
  caption.className = 'docs-image__caption';
  caption.textContent = captionText;

  return caption;
}

function shouldWrapStandaloneImage(root: HTMLElement, image: HTMLImageElement): boolean {
  const parent = image.parentElement;

  if (parent === null) {
    return false;
  }

  if (parent === root || parent.classList.contains('markdown-gallery')) {
    return true;
  }

  return parent.tagName.toLowerCase() === 'p' && isImageOnlyContainer(parent);
}

function wrapStandaloneImage(image: HTMLImageElement): (() => void) | null {
  const parent = image.parentElement;

  if (parent === null) {
    return null;
  }

  const wrapper = document.createElement('span');
  const caption = createImageCaption(image);

  wrapper.className = 'docs-image';
  parent.insertBefore(wrapper, image);
  wrapper.append(image);

  if (caption !== null) {
    wrapper.append(caption);
  }

  return () => {
    if (wrapper.parentElement !== null) {
      wrapper.replaceWith(image);
    }
  };
}

function imageCaption(image: HTMLImageElement): string {
  return image.getAttribute('title')?.trim() || image.getAttribute('alt')?.trim() || '';
}

function imageGalleryId(image: HTMLImageElement): string | null {
  const directGallery = image.dataset.gallery?.trim();

  if (directGallery) {
    return directGallery;
  }

  const gallery = image.closest<HTMLElement>('.markdown-gallery[data-gallery]');
  const galleryId = gallery?.dataset.gallery?.trim();

  return galleryId || null;
}
