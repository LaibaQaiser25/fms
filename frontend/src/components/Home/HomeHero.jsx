import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  steel, orangeText, alpha, gothicType,
  ground, ink, serifNavy, copy, tagNavy, btnNavy, btnOrange, gothic, serif, sans,
} from '../../homeTheme';


// Flat concrete tones for the blocks, lit from the upper right.
const CONCRETE = {
  face: '#CDD0D5',    // the holed faces, turned to the left
  side: '#E1E3E7',    // the solid faces, turned to the right (the lit side)
  under: '#8B919A',   // undersides, where a block overhangs the one below
  wall: '#7E858F',    // a cell's inner side wall
  ceiling: '#4A5059', // a cell's inner top, seen from below
  back: '#353A42',    // deep inside a cell
  edge: alpha(ink, 0.12),
};

// The blocks are real boxes seen from slightly below and to the front, like the
// reference: u runs along a block's holed face (to the left and down on screen),
// v along its solid face (to the right and down), z up. Each box's near corner
// is its smallest u and v, so the visible faces are the holed one (v = v0), the
// solid one (u = u0) and the underside (z = z0). Drawing units match the art box.
const ORIGIN = [424, 160];
const project = (u, v, z) => [ORIGIN[0] - u + v, ORIGIN[1] + 0.55 * u + 0.35 * v - z];
const pts = (...p) => p.map((q) => project(...q).map((n) => +n.toFixed(1)).join(',')).join(' ');
const FAR = 700; // how far the solid faces run: well past the right edge

// One box: u/v/z ranges, plus cells cut into the holed face as [u from, u to,
// z from, z to]. A cell runs right through the block along v; inside it the
// ceiling and the wall on its far-u side show, clipped to the opening.
function Block({ id, u: [u0, u1], v0, z: [z0, z1], cells = [] }) {
  const v1 = v0 + FAR;
  return (
    <g stroke={CONCRETE.edge} strokeWidth="0.75" strokeLinejoin="round">
      <polygon points={pts([u0, v0, z0], [u1, v0, z0], [u1, v1, z0], [u0, v1, z0])} fill={CONCRETE.under} />
      <polygon points={pts([u0, v0, z1], [u0, v1, z1], [u0, v1, z0], [u0, v0, z0])} fill={CONCRETE.side} />
      <polygon points={pts([u0, v0, z1], [u1, v0, z1], [u1, v0, z0], [u0, v0, z0])} fill={CONCRETE.face} />
      {cells.map(([a, b, lo, hi], i) => {
        const clip = `${id}-cell-${i}`;
        return (
          <g key={clip}>
            <clipPath id={clip}><polygon points={pts([a, v0, hi], [b, v0, hi], [b, v0, lo], [a, v0, lo])} /></clipPath>
            <g clipPath={`url(#${clip})`} stroke="none">
              <polygon points={pts([a, v0, hi], [b, v0, hi], [b, v0, lo], [a, v0, lo])} fill={CONCRETE.back} />
              <polygon points={pts([b, v0, hi], [b, v1, hi], [b, v1, lo], [b, v0, lo])} fill={CONCRETE.wall} />
              <polygon points={pts([a, v0, hi], [b, v0, hi], [b, v1, hi], [a, v1, hi])} fill={CONCRETE.ceiling} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

// Three stacked hollow blocks with thin drafting lines behind them, drawn on a
// 514x444 box: the blocks take the right side, bleeding off the right and
// bottom edges; the lines use the space to their left. The tag line sits above
// the top block.
function BlocksArt({ className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={`relative aspect-[514/444] ${className}`}>
      <svg role="img" aria-label="Stacked hollow precast concrete blocks" viewBox="0 0 514 444"
        className="absolute inset-0 h-full w-full overflow-hidden">
        <g fill="none" stroke={alpha(serifNavy, 0.55)} strokeWidth="1">
          <path d="M58 444 A225 225 0 0 1 283 219" />
          <path d="M40 278 H220 M21 356 H220 M143 206 V444 M77 435 L220 300" />
        </g>
        <circle cx="143" cy="278" r="2.5" fill={serifNavy} />
        <circle cx="143" cy="356" r="2.5" fill={serifNavy} />

        {/* Top to bottom, each resting on the next and set a little back on both sides, so every block
            overhangs the one below and its underside shows. Drawn in that order so each lower block
            covers what it should of the one above. */}
        <Block id={`${id}t`} u={[0, 236]} v0={0} z={[0, 122]}
          cells={[[14, 60, 13, 109], [72, 118, 13, 109], [130, 196, 13, 109], [208, 224, 13, 109]]} />
        <Block id={`${id}m`} u={[40, 250]} v0={32} z={[-112, 0]}
          cells={[[54, 100, -99, -13], [112, 158, -99, -13], [170, 236, -99, -13]]} />
        <Block id={`${id}b`} u={[62, 214]} v0={64} z={[-600, -112]}
          cells={[[86, 190, -600, -138]]} />
      </svg>
      <p className="absolute right-3 top-[9%] whitespace-nowrap text-[clamp(0.7rem,1.1vw,0.95rem)] font-extrabold uppercase"
        style={{ fontFamily: sans, color: tagNavy, letterSpacing: '0.55em' }}>
        -Precast Solutions-
      </p>
    </div>
  );
}

// Headline + one CTA on the left, the blocks art on the right, then three
// "learn more" columns. On desktop the top part fills the window below the navbar
// (up to 760px) and the art stands on its bottom rule, bleeding off the right edge
// like the reference; the headline is sized off both the width and the window
// height so the CTA stays above the fold.
export default function HomeHero({ highlights }) {
  return (
    <section className="relative" style={{ background: ground }}>
      {/* faint blueprint verticals, fading out towards the bottom */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${alpha(steel, 0.28)} 0 1px, transparent 1px 120px)`,
          maskImage: 'linear-gradient(180deg, #000 0%, transparent 82%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 82%)',
        }}
      />

      <div className="relative overflow-x-clip lg:min-h-[min(calc(100vh_-_77px),760px)]"
        style={{ borderBottom: `1px solid ${alpha(serifNavy, 0.12)}` }}>
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col px-6 pt-10 lg:min-h-[inherit] lg:justify-center lg:py-10">
          {/* w-fit: BIN-ZAHID sets the block's width and & PARTNERS is spread to match it. The headline's
              trailing letter space is taken back with a negative margin so the two lines end flush. The visual
              lines are aria-hidden; screen readers get the plain name. */}
          <h1 className="w-fit text-[length:clamp(4.5rem,26vw,10rem)] lg:text-[length:clamp(6rem,min(11vw,calc((100vh_-_24rem)/1.2)),11.5rem)]"
            style={{ color: ink }}>
            <span className="sr-only">Bin-Zahid &amp; Partners</span>
            <span aria-hidden="true" className="block whitespace-nowrap uppercase"
              style={{ fontFamily: gothic, fontStretch: '90%', lineHeight: 0.9, letterSpacing: '0.09em', marginRight: '-0.08em' }}>
              Bin-Zahid
            </span>
            <span aria-hidden="true" className="mt-[0.12em] flex justify-between uppercase"
              style={{ fontFamily: serif, fontWeight: 500, fontSize: '0.27em', lineHeight: 1, color: serifNavy }}>
              {[...'&Partners'].map((c, i) => <span key={i} className={i === 0 ? 'mr-[0em]' : ''}>{c}</span>)}
            </span>
          </h1>

          <p className="mt-7 max-w-[28rem] text-[17px] leading-[1.45]" style={{ fontFamily: sans, color: copy }}>
            Bin-Zahid &amp; Partners delivers world-class precast concrete products — durable, cost-effective, and always on time.
          </p>

          <div className="mt-9">
            <Link to="/services"
              className="group inline-flex items-center gap-6 rounded-full py-2 pl-8 pr-2 transition hover:opacity-95"
              style={{ background: btnNavy, color: '#fff' }}>
              <span className="text-[17px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: sans }}>Explore Services</span>
              <span className="grid h-12 w-12 place-items-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5"
                style={{ background: btnOrange }}>
                <ArrowRight size={22} />
              </span>
            </Link>
          </div>
        </div>

        {/* Mobile/tablet: the art follows the text, against the right edge. Desktop: pinned to the bottom-right
            corner of the window-tall block, as tall as fits below the navbar, and never wider than the window less
            ~31rem for the text column (x0.86 turns that width into the 514x444 box's height). */}
        <BlocksArt className="ml-auto mt-10 w-[min(100%,560px)] lg:absolute lg:bottom-0 lg:right-0 lg:mt-0 lg:h-[min(calc(100vh_-_77px_-_2rem),700px,calc((100vw_-_31rem)*0.86))] lg:w-auto" />
      </div>

      {/* Three columns */}
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-6 pb-16 pt-16 md:grid-cols-3 md:gap-8">
        {highlights.map((h) => (
          <div key={h.title} className="flex flex-col">
            <h3 style={{ ...gothicType, fontSize: '1.6rem', color: ink }}>{h.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ fontFamily: sans, color: copy }}>
              {h.text}
            </p>
            <div className="mt-auto pt-4">
              <Link to={h.to}
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] transition hover:gap-3"
                style={{ color: orangeText }}>
                Learn more <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
