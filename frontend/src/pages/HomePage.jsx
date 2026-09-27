import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Clock, Users } from 'lucide-react';
import PublicLayout from '../layouts/PublicLayout';
import HomeHero from '../components/Home/HomeHero';
import ProductSlider from '../components/Home/ProductSlider';
import ProjectShowcase from '../components/Home/ProjectShowcase';
import { Skyline } from '../components/Home/Art';
import {
  white, steel, blue, navy, orange, orangeText, orangeSoft, alpha,
  ground, ink, serifNavy, tagNavy, btnOrange, sans, gothicType, serifType,
} from '../homeTheme';
import { Tag, SectionTitle, PillButton } from '../components/Public/ui';
import { card, bodyStyle } from '../components/Public/styles';

// The three "learn more" columns under the hero.
const HERO_HIGHLIGHTS = [
  { title: 'Interlocking Pavers', text: 'Driveways, walkways & courtyards in dozens of patterns.', to: '/services' },
  { title: 'Precast Structural', text: 'Engineered beams and columns for heavy-duty builds.', to: '/services' },
  { title: 'Slabs & Boundary Walls', text: 'Durable precast panels for secure, low-maintenance perimeters.', to: '/services' },
];

// Portrait cards — photos chosen to stay sharp at ~300px wide. `position` is the
// object-position crop for the taller-than-source ones.
const PRODUCTS = [
  {
    title: 'Interlocking Pavers', desc: 'Driveways, walkways & courtyards in dozens of patterns.',
    image: '/gallery/star-pattern-pavers.webp', alt: 'Star-pattern interlocking pavers in orange, grey and navy', to: '/services',
  },
  {
    title: 'Precast Beams & Structural', desc: 'Engineered beams and columns for heavy-duty builds.',
    image: '/gallery/precast-beam-ceiling-brick-columns.webp', alt: 'Precast beams spanning brick columns', to: '/services', position: '35% 50%',
  },
  {
    title: 'Boundary Walls & Fencing', desc: 'Durable precast panels for secure, low-maintenance perimeters.',
    image: '/gallery/precast-boundary-wall-panels-1.webp', alt: 'A precast boundary wall with a contrasting band', to: '/services',
  },
  {
    title: 'Drainage & Infrastructure', desc: 'Precast pipes and culverts built for long service life.',
    image: '/gallery/concrete-drain-pipes-stacked-pyramid.webp', alt: 'Concrete drain pipes stacked in a pyramid', to: '/services', position: '30% 50%',
  },
  {
    title: 'Balustrades & Railings', desc: 'Ornamental precast railings for verandas and boundaries.',
    image: '/gallery/white-gazebo-balustrade-veranda.webp', alt: 'A white gazebo with a precast balustrade', to: '/services',
  },
  {
    title: 'Quality-Controlled Curing', desc: 'Every batch cured and inspected before it leaves our yard.',
    image: '/gallery/concrete-slab-molds-curing-yard-1.webp', alt: 'Concrete slab molds curing in the yard', to: '/services',
  },
];

const FEATURED_PROJECTS = [
  { src: '/gallery/hexagon-textured-pavers-closeup.webp', title: 'Hexagon Textured Pavers' },
  { src: '/gallery/star-pattern-pavers.webp', title: 'Star Pattern Custom Design' },
  { src: '/gallery/chevron-pavers-red-black-grey-closeup.webp', title: 'Chevron Pattern Pavers' },
  { src: '/gallery/zigzag-pavers-courtyard-garden.webp', title: 'Courtyard Landscaping' },
  { src: '/gallery/worker-laying-zigzag-pavers.webp', title: 'Precision On-Site Installation' },
  { src: '/gallery/workers-laying-diamond-pavers-house.webp', title: 'Residential Diamond Pavers' },
  { src: '/gallery/herringbone-pavers-with-bushes.webp', title: 'Herringbone Garden Walkways' },
  { src: '/gallery/hexagon-wave-pavers-white-red-pathway.webp', title: 'Wave Pattern Pathways' },
];

// bars = [height %, fill] for the little skyline along the bottom of each card.
const STRENGTHS = [
  {
    icon: Shield, title: 'Quality Guaranteed', desc: 'ISO certified manufacturing with strict quality control at every stage.',
    bars: [[38, steel], [62, blue], [100, orange], [46, navy], [72, steel], [54, blue], [86, orange], [34, steel]],
  },
  {
    icon: Clock, title: 'On-Time Delivery', desc: 'Reliable logistics ensuring your projects always stay on schedule.',
    bars: [[52, orange], [34, steel], [78, navy], [100, blue], [44, steel], [66, orange], [30, blue], [58, steel]],
  },
  {
    icon: Users, title: 'Expert Team', desc: 'Decades of combined experience in precast construction and engineering.',
    bars: [[60, blue], [90, steel], [42, orange], [70, navy], [100, orange], [36, steel], [64, blue], [48, navy]],
  },
];

const STATS = [
  { value: '500', label: 'Projects Completed' },
  { value: '30', label: 'Years Experience' },
  { value: '200', label: 'Happy Clients' },
  { value: '50', label: 'Expert Engineers' },
];

const EXPLORE = [
  {
    title: 'Company',
    links: [{ label: 'About Us', to: '/about' }, { label: 'Our Specialities', to: '/specialities' }],
  },
  {
    title: 'Our Work',
    links: [{ label: 'Services', to: '/services' }, { label: 'Featured Projects', to: '#our-work' }],
  },
  {
    title: 'Connect',
    links: [{ label: 'Contact Us', to: '/contact' }, { label: 'Leave Feedback', to: '/feedback' }],
  },
];

const pad = (n) => String(n).padStart(2, '0');

export default function HomePage() {
  return (
    <PublicLayout skin="home">

      {/* ---------------------------------- Hero ---------------------------------- */}
      <HomeHero highlights={HERO_HIGHLIGHTS} />

      {/* -------------------------------- Products --------------------------------- */}
      <section className="py-24" style={{ background: white }}>
        <div className="mx-auto max-w-7xl px-6">
          <SectionTitle tag="What we make" title="Popular Products" font="serif" center />
          <div className="mt-14">
            <ProductSlider products={PRODUCTS} />
          </div>
        </div>
      </section>

      {/* ---------------------------- Featured projects ---------------------------- */}
      <ProjectShowcase id="our-work" background="/gallery/concrete-slabs-large-stack-yard-1.webp" projects={FEATURED_PROJECTS}>
        <Tag color={orangeSoft}>What we do</Tag>
        <h2 className="mt-6">
          <span className="block" style={{ ...gothicType, fontSize: 'clamp(3.4rem, 8vw, 6.5rem)', color: white }}>Built to last.</span>
          <span className="mt-3 block" style={{ ...serifType, fontSize: 'clamp(1.6rem, 3.6vw, 2.75rem)', color: orangeSoft }}>Delivered on time.</span>
        </h2>
        <p className="mt-7 max-w-md text-lg leading-relaxed" style={{ fontFamily: sans, color: alpha(white, 0.82) }}>
          Real projects, real pavers, real craftsmanship — a look at what we produce and install.
        </p>
        <Link to="/services" className="group mt-10 inline-flex items-center gap-5">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-white/60 transition duration-300 group-hover:border-[#E0551D] group-hover:bg-[#E0551D]">
            <ArrowRight size={26} />
          </span>
          <span style={{ fontFamily: sans }}>
            <span className="block text-sm font-bold uppercase tracking-[0.2em]">Explore our work</span>
            <span className="mt-1 block max-w-[16rem] text-sm leading-snug" style={{ color: alpha(white, 0.75) }}>
              Recognized as a trusted precast manufacturer across the region
            </span>
          </span>
        </Link>
      </ProjectShowcase>

      {/* ------------------------------ Why Choose Us ------------------------------ */}
      <section className="py-24" style={{ background: ground }}>
        <div className="mx-auto max-w-7xl px-6">
          <SectionTitle tag="Our strengths" title="Why Choose Us" center />

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {STRENGTHS.map(({ icon, title, desc, bars }, i) => {
              const Icon = icon;
              return (
                <article key={title} className="group relative overflow-hidden rounded-2xl transition duration-300 hover:-translate-y-1.5" style={card}>
                  <div className="p-9">
                    <div className="flex items-start justify-between">
                      <span aria-hidden="true"
                        style={{ ...gothicType, fontSize: '5.5rem', lineHeight: 0.8, color: 'transparent', WebkitTextStroke: `1.5px ${steel}` }}>
                        {pad(i + 1)}
                      </span>
                      <span className="grid h-14 w-14 place-items-center rounded-full text-white" style={{ background: btnOrange }}>
                        <Icon size={26} />
                      </span>
                    </div>
                    <h3 className="mt-8" style={{ ...gothicType, fontSize: '2.2rem', color: ink }}>{title}</h3>
                    <p className="mt-3 leading-relaxed" style={bodyStyle}>{desc}</p>
                  </div>

                  <div aria-hidden="true" className="flex h-24 items-end gap-1.5 px-9">
                    {bars.map(([h, fill], k) => (
                      <span key={k} className="flex-1 origin-bottom transition-transform duration-500 group-hover:scale-y-110"
                        style={{ height: `${h}%`, background: fill, borderRadius: '3px 3px 0 0' }} />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ----------------------------- Numbers + explore ---------------------------- */}
      <section className="py-24" style={{ background: white }}>
        <div className="mx-auto max-w-7xl px-6">
          <dl className="grid grid-cols-2 gap-y-12 md:grid-cols-4">
            {STATS.map((s, i) => (
              <div key={s.label} className={`flex flex-col-reverse px-6 md:px-8 ${i > 0 ? 'md:border-l' : ''}`}
                style={{ borderColor: alpha(serifNavy, 0.14) }}>
                <dt className="mt-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ fontFamily: sans, color: tagNavy }}>{s.label}</dt>
                <dd style={{ ...gothicType, fontSize: 'clamp(3.5rem, 6.4vw, 5.5rem)', lineHeight: 1, color: ink }}>
                  {s.value}<span style={{ color: btnOrange }}>+</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-20 grid gap-12 border-t pt-14 md:grid-cols-3" style={{ borderColor: alpha(serifNavy, 0.14) }}>
            {EXPLORE.map(({ title, links }, i) => (
              <div key={title}>
                <p className="text-xs font-bold uppercase tracking-[0.22em]" style={{ fontFamily: sans, color: orangeText }}>{pad(i + 1)}</p>
                <h3 className="mt-2" style={{ ...serifType, fontSize: '1.7rem', color: ink }}>{title}</h3>
                <ul className="mt-5">
                  {links.map((l) => {
                    const linkClass = 'group flex items-center justify-between py-3.5 font-semibold';
                    const linkStyle = { fontFamily: sans, color: ink };
                    const inner = (
                      <>
                        {l.label}
                        <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" style={{ color: btnOrange }} />
                      </>
                    );
                    return (
                      <li key={l.label} style={{ borderBottom: `1px solid ${alpha(serifNavy, 0.14)}` }}>
                        {l.to.startsWith('#') ? (
                          <a href={l.to} className={linkClass} style={linkStyle}>{inner}</a>
                        ) : (
                          <Link to={l.to} className={linkClass} style={linkStyle}>{inner}</Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------- CTA ----------------------------------- */}
      <section className="relative overflow-hidden" style={{ background: ground }}>
        <div className="relative z-10 mx-auto max-w-3xl px-6 pt-24 text-center"
          style={{ paddingBottom: 'calc(clamp(150px, 16.7vw, 340px) + 56px)' }}>
          <Tag>Let&rsquo;s build together</Tag>
          <h2 className="mt-6">
            <span className="block" style={{ ...gothicType, fontSize: 'clamp(3rem, 7vw, 5.5rem)', color: ink }}>Ready to start</span>
            <span className="mt-3 block" style={{ ...serifType, fontSize: 'clamp(1.6rem, 3.6vw, 2.6rem)', color: btnOrange }}>your project?</span>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed" style={bodyStyle}>
            Get in touch with our team today for a free consultation and quote.
          </p>
          <PillButton to="/contact" className="mt-10">Contact Us Now</PillButton>
        </div>

        <Skyline className="pointer-events-none absolute inset-x-0 bottom-0 w-full" style={{ height: 'clamp(150px, 16.7vw, 340px)' }} />
      </section>

    </PublicLayout>
  );
}
