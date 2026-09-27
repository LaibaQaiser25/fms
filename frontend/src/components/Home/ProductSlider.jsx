import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { white, alpha, btnNavy as navy, btnOrange as orange, gothicType, sans } from '../../homeTheme';
import { prefersReducedMotion } from './motion';

const GAP = 20; // matches gap-5

// A horizontally scrolling row of tall portrait photo cards (scroll-snap, so it
// also works by swipe/trackpad), with arrow buttons and a row of dashes that
// tracks — and can scrub — the scroll position.
export default function ProductSlider({ products }) {
  const scroller = useRef(null);
  const [progress, setProgress] = useState(0); // 0..1 across the scrollable range
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max > 0 ? el.scrollLeft / max : 0);
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft >= max - 4);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(measure); // first read, once layout has settled
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const behavior = () => (prefersReducedMotion() ? 'auto' : 'smooth');

  const step = (dir) => {
    const el = scroller.current;
    const card = el.firstElementChild;
    el.scrollBy({ left: dir * (card.offsetWidth + GAP), behavior: behavior() });
  };

  const goTo = (i) => {
    const el = scroller.current;
    el.scrollTo({ left: el.children[i].offsetLeft, behavior: behavior() });
  };

  const activeDash = Math.round(progress * (products.length - 1));

  const arrowClass = 'grid h-12 w-12 place-items-center rounded-full transition disabled:opacity-30';
  const arrowStyle = { border: `1.5px solid ${alpha(navy, 0.25)}`, color: navy };

  return (
    <div role="region" aria-roledescription="carousel" aria-label="Our products">
      <ul
        ref={scroller}
        onScroll={measure}
        className="relative flex gap-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2"
      >
        {products.map((p, i) => (
          <li key={p.title} className="shrink-0 snap-start basis-[78%] sm:basis-[46%] lg:basis-[calc((100%_-_60px)/4)]">
            <Link
              to={p.to}
              className="group relative block aspect-[3/4] overflow-hidden rounded-2xl"
              style={{ background: navy }}
            >
              <img
                src={p.image}
                alt={p.alt}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                style={{ objectPosition: p.position }}
              />
              <div aria-hidden="true" className="absolute inset-0"
                style={{ background: `linear-gradient(180deg, ${alpha(navy, 0)} 30%, ${alpha(navy, 0.94)} 100%)` }} />

              {/* on a navy chip so it stays legible over the lighter photos */}
              <span className="absolute left-4 top-4 rounded-full px-3 pb-0.5 pt-1"
                style={{ ...gothicType, fontSize: '1.15rem', lineHeight: 1, color: white, background: alpha(navy, 0.72) }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full opacity-0 transition duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ background: orange, color: white }}>
                <ArrowUpRight size={18} />
              </span>

              <div className="absolute inset-x-0 bottom-0 p-6">
                <h3 style={{ ...gothicType, fontSize: '1.9rem', color: white }}>{p.title}</h3>
                <p className="mt-2 text-sm leading-snug" style={{ fontFamily: sans, color: alpha(white, 0.82) }}>{p.desc}</p>
                <span className="mt-4 block h-[3px] w-10 transition-all duration-300 group-hover:w-24" style={{ background: orange }} />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex items-center justify-center gap-6">
        <button type="button" onClick={() => step(-1)} disabled={atStart} aria-label="Previous products"
          className={arrowClass} style={arrowStyle}>
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-2">
          {products.map((p, i) => (
            <button key={p.title} type="button" onClick={() => goTo(i)} aria-label={`Go to ${p.title}`}
              aria-current={i === activeDash}
              className="flex h-6 items-center">
              <span className="block h-[3px] transition-all duration-300"
                style={{ width: i === activeDash ? 40 : 18, background: i === activeDash ? orange : alpha(navy, 0.2) }} />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => step(1)} disabled={atEnd} aria-label="Next products"
          className={arrowClass} style={arrowStyle}>
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
}
