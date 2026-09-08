import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ImageCarousel({ slides, interval = 5000 }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), interval);
    return () => clearInterval(id);
  }, [paused, slides.length, interval]);

  const go = (i) => setIndex(((i % slides.length) + slides.length) % slides.length);

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.1)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-[16/9]" style={{ background: '#000' }}>
        {slides.map((s, i) => (
          <img
            key={s.src}
            src={s.src}
            alt={s.title}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}

        <div
          className="absolute inset-0 flex items-end p-6 md:p-10"
          style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(15,12,12,0.9) 100%)' }}
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#ef4444' }}>
              Featured Project
            </p>
            <h3 className="text-white text-xl md:text-3xl font-bold">{slides[index].title}</h3>
          </div>
        </div>

        <button
          onClick={() => go(index - 1)}
          aria-label="Previous slide"
          className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition hover:opacity-80"
          style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
        >
          <ChevronLeft size={22} />
        </button>
        <button
          onClick={() => go(index + 1)}
          aria-label="Next slide"
          className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition hover:opacity-80"
          style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="flex justify-center gap-2 py-4" style={{ background: '#1a1a1a' }}>
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}`}
            className="rounded-full transition-all"
            style={{
              width: i === index ? '24px' : '8px',
              height: '8px',
              background: i === index ? '#ef4444' : 'rgba(255,255,255,0.25)',
            }}
          />
        ))}
      </div>

      <div className="hidden md:flex gap-2 px-4 pb-4 overflow-x-auto" style={{ background: '#1a1a1a' }}>
        {slides.map((s, i) => (
          <button
            key={s.src}
            onClick={() => go(i)}
            className="relative shrink-0 w-28 aspect-video rounded overflow-hidden transition"
            style={{
              outline: i === index ? '2px solid #ef4444' : '2px solid transparent',
              outlineOffset: '-2px',
              opacity: i === index ? 1 : 0.55,
            }}
          >
            <img src={s.src} alt={s.title} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
