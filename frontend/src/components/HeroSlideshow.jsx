import { useEffect, useState } from 'react';

export default function HeroSlideshow({ images, interval = 6000, showDots = false }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, interval);
    return () => clearInterval(id);
  }, [images.length, interval]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity ease-in-out"
          style={{ opacity: i === index ? 1 : 0, transitionDuration: '1500ms' }}
          // Slide 0 paints immediately (it's the page's LCP image); the rest
          // are only visible after a delayed CSS fade, so deprioritize their
          // fetch — loading="lazy" won't help since they're already in the
          // viewport, but fetchPriority does.
          fetchPriority={i === 0 ? 'high' : 'low'}
          loading={i === 0 ? 'eager' : 'lazy'}
        />
      ))}

      {showDots && (
        <div className="absolute bottom-6 right-6 md:bottom-8 md:right-10 flex gap-2 z-10">
          {images.map((src, i) => (
            <button
              key={src}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="rounded-full transition-all"
              style={{
                width: i === index ? '20px' : '7px',
                height: '7px',
                background: i === index ? '#ef4444' : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
