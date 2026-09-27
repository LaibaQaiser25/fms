import { useEffect, useRef, useState } from 'react';
import { white, orangeSoft, alpha, btnNavy as navy, btnOrange as orange, gothicType, sans } from '../../homeTheme';
import { prefersReducedMotion, useInView } from './motion';

const INTERVAL = 5000;
const pad = (n) => String(n).padStart(2, '0');

// A dark statement band over a full-bleed photo: the caller's `children` are the
// headline column; on the right a portrait preview card shows the selected
// project, chosen from the thumbnail strip along the bottom. It auto-advances,
// but only while in view (paused on hover/focus, and never with reduced motion).
export default function ProjectShowcase({ id, background, projects, children }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef);

  useEffect(() => {
    if (paused || !inView || reduced) return undefined;
    const t = setInterval(() => setActive((i) => (i + 1) % projects.length), INTERVAL);
    return () => clearInterval(t);
  }, [active, paused, inView, reduced, projects.length]);

  return (
    <section
      ref={sectionRef}
      id={id}
      className="relative isolate overflow-hidden"
      style={{ background: navy, color: white }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <img src={background} alt="" aria-hidden="true" loading="lazy"
        className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <div aria-hidden="true" className="absolute inset-0 -z-10"
        style={{ background: `linear-gradient(100deg, ${alpha(navy, 0.97)} 0%, ${alpha(navy, 0.88)} 45%, ${alpha(navy, 0.6)} 100%)` }} />

      <div className="mx-auto max-w-7xl px-6 pb-12 pt-24">
        <div className="grid items-center gap-16 lg:grid-cols-12">
          <div className="lg:col-span-7">{children}</div>

          <figure className="relative mx-auto w-full max-w-[380px] lg:col-span-5 lg:mr-6">
            <div className="relative">
              {/* a thin offset outline (the drafting-style double edge used across the public pages) */}
              <div aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-3.5 translate-y-3.5 rounded-2xl"
                style={{ border: `1px solid ${alpha(white, 0.5)}` }} />
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl" style={{ background: navy }}>
                {projects.map((p, i) => (
                  <img key={p.src} src={p.src} alt={p.title} loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
                    style={{ opacity: i === active ? 1 : 0 }} />
                ))}
              </div>
            </div>
            <figcaption className="relative mt-14 flex items-end justify-between gap-4">
              <div aria-live="polite">
                <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ fontFamily: sans, color: orangeSoft }}>Featured project</p>
                <p className="mt-1" style={{ ...gothicType, fontSize: '1.75rem' }}>{projects[active].title}</p>
              </div>
              <span className="whitespace-nowrap" style={{ ...gothicType, fontSize: '1.15rem', color: alpha(white, 0.7) }}>
                {pad(active + 1)} / {pad(projects.length)}
              </span>
            </figcaption>
          </figure>
        </div>

        <div className="scrollbar-hide -mx-1 mt-14 flex gap-3 overflow-x-auto px-1 py-2">
          {projects.map((p, i) => (
            <button key={p.src} type="button" onClick={() => setActive(i)}
              aria-label={`Show ${p.title}`} aria-pressed={i === active}
              className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl transition duration-300"
              // a box-shadow ring (not an inline outline, which would also suppress the
              // browser's own keyboard-focus indicator on these buttons)
              style={{
                boxShadow: i === active ? `0 0 0 3px ${navy}, 0 0 0 5px ${orange}` : 'none',
                opacity: i === active ? 1 : 0.6,
              }}>
              <img src={p.src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
