import PublicLayout from '../layouts/PublicLayout';
import PageHero from '../components/PageHero';
import { Building2, Home, Factory, Zap, ArrowRight } from 'lucide-react';
import { orangeText, ground, ink, btnOrange, gothicType, sans } from '../homeTheme';
import { SectionTitle, PillButton } from '../components/Public/ui';
import { card, bodyStyle } from '../components/Public/styles';

const heading = { ...gothicType, color: ink };

export default function ServicesPage() {
  const services = [
    {
      icon: Home,
      title: 'Residential Precast',
      description: 'High-quality precast elements for residential buildings including stairs, columns, and beams.',
      image: '/gallery/white-balustrade-railing-with-post-cap.webp',
    },
    {
      icon: Building2,
      title: 'Commercial Solutions',
      description: 'Customized precast products designed for commercial and retail construction projects.',
      image: '/gallery/slate-look-pavers-driveway-grey.webp',
    },
    {
      icon: Factory,
      title: 'Industrial Components',
      description: 'Heavy-duty precast units engineered for industrial applications and warehouses.',
      image: '/gallery/precast-beam-ceiling-brick-columns.webp',
    },
    {
      icon: Zap,
      title: 'Custom Design',
      description: 'Bespoke precast solutions tailored to your specific project requirements.',
      image: '/gallery/star-pattern-pavers.webp',
    },
    {
      icon: Building2,
      title: 'Bridge Components',
      description: 'Specialized precast units for infrastructure and bridge construction projects.',
      image: '/gallery/concrete-drain-pipes-stacked-pyramid.webp',
    },
    {
      icon: Home,
      title: 'Finishing Solutions',
      description: 'Aesthetic precast panels and finishes for modern architectural designs.',
      image: '/gallery/hexagon-textured-pavers-closeup.webp',
    },
  ];

  return (
    <PublicLayout skin="home">
      <PageHero
        eyebrow="What We Do"
        title="Our Services"
        subtitle="Comprehensive precast solutions for every project"
        image="/gallery/precast-beam-ceiling-brick-columns.webp"
      />

      {/* Services Grid */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <SectionTitle tag="Precast for every build" title="What We Make" font="serif" center />
          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <div key={service.title} className="group overflow-hidden rounded-2xl transition hover:-translate-y-1" style={card}>
                  <div className="relative h-48">
                    <img src={service.image} alt={service.title} className="h-full w-full object-cover" loading="lazy" />
                    <span className="absolute -bottom-6 left-7 grid h-12 w-12 place-items-center rounded-full text-white ring-4 ring-white"
                      style={{ background: btnOrange }}>
                      <Icon size={20} />
                    </span>
                  </div>
                  <div className="p-7 pt-10">
                    <h3 className="uppercase" style={{ ...heading, fontSize: '1.9rem' }}>{service.title}</h3>
                    <p className="mt-3 leading-relaxed" style={bodyStyle}>{service.description}</p>
                    <button className="mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] transition group-hover:gap-3"
                      style={{ fontFamily: sans, color: orangeText }}>
                      Learn More <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20" style={{ background: ground }}>
        <div className="max-w-7xl mx-auto px-6">
          <SectionTitle tag="Why choose us" title="Service Highlights" center />
          <div className="mt-12 grid md:grid-cols-2 gap-8">
            {[
              { title: 'Fast Delivery', desc: 'Quick turnaround without compromising quality' },
              { title: 'Expert Installation', desc: 'Professional support throughout installation' },
              { title: 'Cost Effective', desc: 'Competitive pricing with superior quality' },
              { title: 'Durability', desc: '50+ year lifespan with minimal maintenance' },
            ].map((item, i) => (
              <div key={item.title} className="flex gap-6 rounded-2xl p-8" style={card}>
                <span className="shrink-0" style={{ ...heading, fontSize: '3rem', color: btnOrange }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="uppercase" style={{ ...heading, fontSize: '1.75rem' }}>{item.title}</h3>
                  <p className="mt-2 leading-relaxed" style={bodyStyle}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-14 text-center">
            <PillButton to="/contact">Get a Quote</PillButton>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
