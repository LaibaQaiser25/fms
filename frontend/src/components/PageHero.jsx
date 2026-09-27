import { alpha, steel, ground, serifNavy } from '../homeTheme';
import { Tag, Title } from './Public/ui';
import { bodyStyle } from './Public/styles';

// The banner at the top of each inner public page, in the home hero's look:
// the off-white ground with faint blueprint verticals, a "-TAG-" line, a
// League Gothic title and Montserrat subtitle on the left, and the photo on the
// right in a flat frame with an offset hairline outline (a drafting-style
// double edge, no shadow).
export default function PageHero({ eyebrow, title, subtitle, image }) {
  return (
    <section className="relative overflow-hidden" style={{ background: ground, borderBottom: `1px solid ${alpha(serifNavy, 0.12)}` }}>
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${alpha(steel, 0.28)} 0 1px, transparent 1px 120px)`,
          maskImage: 'linear-gradient(180deg, #000 0%, transparent 90%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 90%)',
        }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-14 md:py-20 lg:grid-cols-12">
        <div className={image ? 'lg:col-span-7' : 'lg:col-span-12'}>
          {eyebrow && <Tag className="mb-5">{eyebrow}</Tag>}
          <Title as="h1" size="clamp(3.25rem, 7.5vw, 6.25rem)">{title}</Title>
          {subtitle && <p className="mt-6 max-w-xl text-lg leading-relaxed" style={bodyStyle}>{subtitle}</p>}
        </div>

        {image && (
          <div className="relative lg:col-span-5">
            <div aria-hidden="true" className="absolute inset-0 translate-x-3.5 translate-y-3.5 rounded-2xl"
              style={{ border: `1px solid ${alpha(serifNavy, 0.45)}` }} />
            <img src={image} alt="" fetchPriority="high"
              className="relative aspect-[4/3] w-full rounded-2xl object-cover lg:aspect-[5/4]" />
          </div>
        )}
      </div>
    </section>
  );
}
