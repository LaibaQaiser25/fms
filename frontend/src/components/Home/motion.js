import { useEffect, useState } from 'react';

// Read once (e.g. as a lazy useState initializer) to decide whether the home
// page's auto-advancing slideshows should run.
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Whether the element in `ref` is currently on screen, so the slideshows only
// advance while someone can see them (and don't drift while scrolled away).
export function useInView(ref, threshold = 0.25) {
  const [inView, setInView] = useState(true); // assume visible until the observer says otherwise
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}
