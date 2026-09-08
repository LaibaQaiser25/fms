import { Link } from 'react-router-dom';
import {
  ArrowRight, ChevronRight, Shield, Clock, Users, Award,
  LayoutGrid, Columns, Fence, Droplets, Layers, ShieldCheck,
  Building2, MessageCircle,
} from 'lucide-react';
import PublicLayout from '../layouts/PublicLayout';
import HeroSlideshow from '../components/HeroSlideshow';
import ImageCarousel from '../components/ImageCarousel';

const HERO_SLIDES = [
  '/gallery/slate-look-pavers-driveway-grey.jpeg',
  '/gallery/concrete-slabs-large-stack-yard-1.jpeg',
  '/gallery/concrete-slabs-large-stack-yard-2.jpeg',
];

const HERO_STATS = [
  { value: '30+', label: 'Years Experience' },
  { value: '500+', label: 'Projects Done' },
  { value: '200+', label: 'Happy Clients' },
];

const QUICK_LINKS = [
  {
    icon: Building2, accent: '#b91c1c', title: 'Company',
    links: [{ label: 'About Us', to: '/about' }, { label: 'Our Specialities', to: '/specialities' }],
  },
  {
    icon: LayoutGrid, accent: '#7f1d1d', title: 'Our Work',
    links: [{ label: 'Services', to: '/services' }, { label: 'Featured Projects', to: '#our-work' }],
  },
  {
    icon: MessageCircle, accent: '#52525b', title: 'Connect',
    links: [{ label: 'Contact Us', to: '/contact' }, { label: 'Leave Feedback', to: '/feedback' }],
  },
];

const STRENGTHS = [
  { icon: Shield, title: 'Quality Guaranteed', desc: 'ISO certified manufacturing with strict quality control at every stage.', accent: '#b91c1c' },
  { icon: Clock, title: 'On-Time Delivery', desc: 'Reliable logistics ensuring your projects always stay on schedule.', accent: '#7f1d1d' },
  { icon: Users, title: 'Expert Team', desc: 'Decades of combined experience in precast construction and engineering.', accent: '#52525b' },
];

const CATEGORIES = [
  { icon: LayoutGrid, title: 'Interlocking Pavers', desc: 'Driveways, walkways & courtyards in dozens of patterns.', image: '/gallery/clover-pavers-driveway-house.jpeg' },
  { icon: Columns, title: 'Precast Beams & Structural', desc: 'Engineered beams and columns for heavy-duty builds.', image: '/gallery/precast-beam-ceiling-brick-columns.jpeg' },
  { icon: Fence, title: 'Boundary Walls & Fencing', desc: 'Durable precast panels for secure, low-maintenance perimeters.', image: '/gallery/precast-boundary-wall-panels-2.jpeg' },
  { icon: Droplets, title: 'Drainage & Infrastructure', desc: 'Precast pipes and culverts built for long service life.', image: '/gallery/concrete-drain-pipes-stacked-pyramid.jpeg' },
  { icon: Layers, title: 'Balustrades & Railings', desc: 'Ornamental precast railings for verandas and boundaries.', image: '/gallery/white-balustrade-railing-with-post-cap.jpeg' },
  { icon: ShieldCheck, title: 'Quality-Controlled Curing', desc: 'Every batch cured and inspected before it leaves our yard.', image: '/gallery/concrete-slab-molds-curing-yard-1.jpeg' },
];

const FEATURED_PROJECTS = [
  { src: '/gallery/hexagon-textured-pavers-closeup.jpeg', title: 'Hexagon Textured Pavers' },
  { src: '/gallery/star-pattern-pavers.jpeg', title: 'Star Pattern Custom Design' },
  { src: '/gallery/chevron-pavers-red-black-grey-closeup.jpeg', title: 'Chevron Pattern Pavers' },
  { src: '/gallery/zigzag-pavers-courtyard-garden.jpeg', title: 'Courtyard Landscaping' },
  { src: '/gallery/worker-laying-zigzag-pavers.jpeg', title: 'Precision On-Site Installation' },
  { src: '/gallery/workers-laying-diamond-pavers-house.jpeg', title: 'Residential Diamond Pavers' },
  { src: '/gallery/herringbone-pavers-with-bushes.jpeg', title: 'Herringbone Garden Walkways' },
  { src: '/gallery/hexagon-wave-pavers-white-red-pathway.jpeg', title: 'Wave Pattern Pathways' },
];

const BANNER_STATS = [
  { value: '500+', label: 'Projects Completed' },
  { value: '30+', label: 'Years Experience' },
  { value: '200+', label: 'Happy Clients' },
  { value: '50+', label: 'Expert Engineers' },
];

function MosaicPhoto({ image, title, className }) {
  return (
    <div className={`group relative rounded-lg overflow-hidden ${className}`}
      style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
      <img src={image} alt={title} className="w-full h-full object-cover transition duration-500 group-hover:scale-110" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.88) 100%)' }} />
      <p className="absolute bottom-4 left-4 right-4 text-white text-sm font-bold leading-snug">{title}</p>
    </div>
  );
}

function MosaicStat({ value, label, accent, className }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-6 rounded-lg ${className}`}
      style={{ background: accent, border: '1px solid rgba(255,255,255,0.15)' }}>
      <p className="text-3xl font-extrabold text-white mb-2">{value}</p>
      <p className="text-xs font-bold uppercase tracking-widest text-white/85 leading-snug">{label}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <PublicLayout>

      {/* ---------------------------------- Hero ---------------------------------- */}
      <section className="relative text-white overflow-hidden" style={{ borderBottom: '4px solid #b91c1c' }}>
        <HeroSlideshow images={HERO_SLIDES} showDots />

        <div className="absolute inset-0" style={{
          background: 'linear-gradient(115deg, rgba(17,15,15,0.95) 0%, rgba(17,15,15,0.82) 45%, rgba(17,15,15,0.55) 100%)',
        }} />

        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="grid lg:grid-cols-5 gap-12 items-end">

            {/* Left: headline, CTAs, inline stats */}
            <div className="lg:col-span-3">
              <span className="inline-block px-5 py-2 rounded text-xs font-bold tracking-widest uppercase mb-8"
                style={{ background: '#b91c1c', color: '#fff' }}>
                Est. Since 1990 · ISO Certified
              </span>

              <h1 className="font-bold leading-tight mb-6 text-white"
                style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.25rem)' }}>
                Premium Precast<br />Solutions
              </h1>

              <p className="text-lg leading-relaxed mb-10 max-w-lg"
                style={{ color: 'rgba(255,255,255,0.7)' }}>
                Bin-Zahid &amp; Partners delivers world-class precast concrete products — durable, cost-effective, and always on time.
              </p>

              <div className="flex flex-wrap gap-4 mb-12">
                <Link to="/services"
                  className="inline-flex items-center gap-2 font-bold px-8 py-4 rounded-lg transition hover:opacity-90"
                  style={{ background: '#b91c1c', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}>
                  Explore Services <ArrowRight size={18} />
                </Link>
                <Link to="/contact"
                  className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-lg transition hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
                  Contact Us
                </Link>
              </div>

              <div className="flex flex-wrap gap-x-10 gap-y-4 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                {HERO_STATS.map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-extrabold" style={{ color: '#ef4444' }}>{s.value}</p>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: highlight box */}
            <div className="lg:col-span-2 flex lg:justify-end">
              <div className="p-8 md:p-10 rounded-lg max-w-sm w-full"
                style={{ background: '#7f1d1d', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-4 text-white/80">Our Promise</p>
                <p className="text-3xl md:text-4xl font-extrabold leading-tight text-white">
                  Built To Last, Delivered On Time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------- Quick Links -------------------------------- */}
      <section className="py-14 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {QUICK_LINKS.map(({ icon: Icon, accent, title, links }) => (
              <div key={title} className="flex gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: accent }}>
                  <Icon size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                  <ul className="space-y-1.5">
                    {links.map((l) => {
                      const linkClass = "inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#b91c1c] transition";
                      return (
                        <li key={l.label}>
                          {l.to.startsWith('#') ? (
                            <a href={l.to} className={linkClass}>
                              <ChevronRight size={14} className="text-gray-400" />
                              {l.label}
                            </a>
                          ) : (
                            <Link to={l.to} className={linkClass}>
                              <ChevronRight size={14} className="text-gray-400" />
                              {l.label}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------ Why Choose Us ------------------------------ */}
      <section className="py-24" style={{ background: '#1a1a1a' }}>
        <div className="max-w-7xl mx-auto px-6">

          <header className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#ef4444' }}>Our Strengths</span>
            <h2 className="text-4xl font-bold mt-3 text-white">Why Choose Us</h2>
          </header>

          <div className="grid md:grid-cols-3 gap-8">
            {STRENGTHS.map(({ icon: Icon, title, desc, accent }) => (
              <div key={title}
                className="relative p-8 rounded-lg overflow-hidden transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: '#232020',
                  borderLeft: `4px solid ${accent}`,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-5"
                  style={{ background: accent }}>
                  <Icon size={22} className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------- Our Work --------------------------------- */}
      <section id="our-work" className="py-24" style={{ background: '#111111' }}>
        <div className="max-w-7xl mx-auto px-6">
          <header className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#ef4444' }}>What We Do</span>
            <h2 className="text-4xl font-bold mt-3 mb-4 text-white">Our Work</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Real projects, real pavers, real craftsmanship — a look at what we produce and install.
            </p>
          </header>

          {/* Mosaic grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 md:auto-rows-[210px] gap-4 mb-6">
            <MosaicPhoto
              image={CATEGORIES[5].image} title={CATEGORIES[5].title}
              className="col-span-2 md:col-span-1 md:col-start-1 md:row-start-1 md:row-span-2 h-56 md:h-auto"
            />
            <MosaicStat value="ISO 9001" label="Certified Since 1990" accent="#b91c1c"
              className="md:col-start-2 md:row-start-1" />
            <MosaicPhoto
              image={CATEGORIES[0].image} title={CATEGORIES[0].title}
              className="md:col-start-2 md:row-start-2 h-40 md:h-auto"
            />
            <MosaicPhoto
              image={CATEGORIES[1].image} title={CATEGORIES[1].title}
              className="col-span-2 md:col-span-1 md:col-start-3 md:row-start-1 md:row-span-2 h-56 md:h-auto"
            />
            <MosaicPhoto
              image={CATEGORIES[3].image} title={CATEGORIES[3].title}
              className="md:col-start-4 md:row-start-1 h-40 md:h-auto"
            />
            <MosaicStat value="500+" label="Projects Completed" accent="#7f1d1d"
              className="md:col-start-4 md:row-start-2" />
          </div>

          {/* Featured project spotlight — interactive carousel */}
          <div className="mt-16 max-w-3xl mx-auto">
            <h3 className="text-xl font-bold text-white mb-6">Featured Project Spotlight</h3>
            <ImageCarousel slides={FEATURED_PROJECTS} />
          </div>

          {/* Closing wide banner */}
          <div className="relative rounded-lg overflow-hidden h-56 md:h-64 mt-16">
            <img src="/gallery/precast-beams-stacked-1.jpeg" alt="Bin-Zahid & Partners manufacturing yard"
              className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center" style={{
              background: 'linear-gradient(90deg, rgba(15,12,12,0.94) 0%, rgba(15,12,12,0.6) 55%, transparent 100%)',
            }}>
              <p className="text-white text-2xl md:text-3xl font-bold max-w-xl px-8 md:px-12 leading-snug">
                Recognized as a Trusted Precast Manufacturer Across the Region
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------- Stats Banner ------------------------------ */}
      <section className="py-16" style={{
        background: '#7f1d1d',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {BANNER_STATS.map((s) => (
              <div key={s.label}>
                <p className="text-4xl font-bold text-white">{s.value}</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------- CTA ----------------------------------- */}
      <section className="py-24 text-center" style={{ background: '#1a1a1a' }}>
        <div className="max-w-2xl mx-auto px-6">
          <Award size={42} style={{ color: '#ef4444', margin: '0 auto 1.5rem' }} />
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Start Your Project?</h2>
          <p className="mb-10" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Get in touch with our team today for a free consultation and quote.
          </p>
          <Link to="/contact"
            className="inline-flex items-center gap-2 font-bold px-10 py-4 rounded-lg transition hover:opacity-90"
            style={{ background: '#b91c1c', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}>
            Contact Us Now <ArrowRight size={18} />
          </Link>
        </div>
      </section>

    </PublicLayout>
  );
}
