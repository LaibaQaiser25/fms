import PublicLayout from '../layouts/PublicLayout';
import PageHero from '../components/PageHero';
import { alpha, ground, ink, serifNavy, btnNavy, btnOrange, orangeSoft, gothicType, sans } from '../homeTheme';
import { Tag, Title } from '../components/Public/ui';
import { bodyStyle } from '../components/Public/styles';

export default function SpecialitiesPage() {
  const specialities = [
    {
      image: '/gallery/star-pattern-pavers.webp',
      title: 'Innovation',
      description: 'We invest heavily in research and development to create innovative precast solutions that meet evolving market demands.',
      items: ['3D CAD Design', 'Advanced Manufacturing', 'Material Innovation'],
    },
    {
      image: '/gallery/concrete-slab-molds-curing-yard-1.webp',
      title: 'Quality Assurance',
      description: 'Rigorous testing and inspection at every stage ensures products meet or exceed international standards.',
      items: ['ISO 9001 Certified', 'Regular Audits', 'Lab Testing'],
    },
    {
      image: '/gallery/herringbone-pavers-with-bushes.webp',
      title: 'Sustainability',
      description: 'Eco-friendly manufacturing practices and sustainable material sourcing are core to our operations.',
      items: ['Green Manufacturing', 'Waste Reduction', 'Recycled Materials'],
    },
    {
      image: '/gallery/hexagon-wave-pavers-white-red-pathway.webp',
      title: 'Customization',
      description: 'Flexible manufacturing capabilities allow us to create custom precast solutions for unique project needs.',
      items: ['Custom Designs', 'Variable Dimensions', 'Special Finishes'],
    },
  ];

  return (
    <PublicLayout skin="home">
      <PageHero
        eyebrow="What Sets Us Apart"
        title="Our Specialities"
        subtitle="The craft and standards behind every precast product we ship"
        image="/gallery/pavers-pattern-samples-yard-overview.webp"
      />

      {/* Specialities: alternating photo / text rows */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 space-y-20">
          {specialities.map((spec, i) => (
            <div key={spec.title} className="grid items-center gap-12 md:grid-cols-2">
              <div className={`relative ${i % 2 ? 'md:order-2' : ''}`}>
                <div aria-hidden="true" className="absolute inset-0 translate-x-3.5 translate-y-3.5 rounded-2xl"
                  style={{ border: `1px solid ${alpha(serifNavy, 0.45)}` }} />
                <img src={spec.image} alt={spec.title} className="relative h-72 w-full rounded-2xl object-cover md:h-80" loading="lazy" />
              </div>

              <div>
                <Tag className="mb-4">{String(i + 1).padStart(2, '0')}</Tag>
                <Title font={i % 2 ? 'gothic' : 'serif'}>{spec.title}</Title>
                <p className="mt-5 leading-relaxed" style={bodyStyle}>{spec.description}</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  {spec.items.map((item) => (
                    <span key={item} className="rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.12em]"
                      style={{ fontFamily: sans, color: ink, background: ground, border: `1px solid ${alpha(serifNavy, 0.2)}` }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 text-white" style={{ background: btnNavy, borderTop: `3px solid ${btnOrange}` }}>
        <div className="max-w-7xl mx-auto px-6">
          <Tag className="text-center" color={orangeSoft}>By the numbers</Tag>
          <Title className="mt-4 text-center" color="#fff" font="serif">Our Achievements</Title>
          <div className="mt-12 grid grid-cols-2 gap-10 md:grid-cols-4 text-center">
            {[
              { number: '50+', label: 'International Awards' },
              { number: '100%', label: 'Quality Rate' },
              { number: '15+', label: 'Manufacturing Units' },
              { number: '5M+', label: 'Units Produced' },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ ...gothicType, fontSize: 'clamp(3rem, 6vw, 4.5rem)', color: orangeSoft }}>
                  {item.number}
                </div>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-white/75" style={{ fontFamily: sans }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
