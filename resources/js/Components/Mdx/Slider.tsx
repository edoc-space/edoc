import React from 'react';
import { SliderProps } from './types';
import { blockClass, variantData } from './utils';

export function Slider({ title, images = [], children, className, variant }: SliderProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const hasImages = images.length > 0;

  return (
    <section className={blockClass('slider', className)} {...variantData(variant)}>
      {title ? <h3 className="markdown-component__title markdown-slider__title">{title}</h3> : null}
      {hasImages ? (
        <>
          <div className="markdown-slider__viewport">
            {images.map((image, index) => (
              <figure className="markdown-slider__slide" data-active={index === activeIndex ? 'true' : 'false'} key={image.src}>
                <img src={image.src} alt={image.alt ?? ''} />
                {image.alt ? <figcaption>{image.alt}</figcaption> : null}
              </figure>
            ))}
          </div>
          {images.length > 1 ? (
            <div className="markdown-slider__controls">
              <button
                type="button"
                className="markdown-slider__button"
                aria-label="Предыдущий слайд"
                onClick={() => setActiveIndex((activeIndex + images.length - 1) % images.length)}
              >
                Назад
              </button>
              <button
                type="button"
                className="markdown-slider__button"
                aria-label="Следующий слайд"
                onClick={() => setActiveIndex((activeIndex + 1) % images.length)}
              >
                Дальше
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="markdown-slider__viewport">{children}</div>
      )}
    </section>
  );
}
