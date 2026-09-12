import PublicLayout from '../layouts/PublicLayout';
import PageHero from '../components/PageHero';
import { Lightbulb, Shield, Leaf, Sliders } from 'lucide-react';

export default function SpecialitiesPage() {
  const specialities = [
    {
      image: '/gallery/star-pattern-pavers.jpeg',
      title: 'Innovation',
      description: 'We invest heavily in research and development to create innovative precast solutions that meet evolving market demands.',
      items: ['3D CAD Design', 'Advanced Manufacturing', 'Material Innovation'],
    },
    {
      image: '/gallery/concrete-slab-molds-curing-yard-1.jpeg',
      title: 'Quality Assurance',
      description: 'Rigorous testing and inspection at every stage ensures products meet or exceed international standards.',
      items: ['ISO 9001 Certified', 'Regular Audits', 'Lab Testing'],
    },
    {
      image: '/gallery/herringbone-pavers-with-bushes.jpeg',
      title: 'Sustainability',
      description: 'Eco-friendly manufacturing practices and sustainable material sourcing are core to our operations.',
      items: ['Green Manufacturing', 'Waste Reduction', 'Recycled Materials'],
    },
    {
      image: '/gallery/hexagon-wave-pavers-white-red-pathway.jpeg',
      title: 'Customization',
      description: 'Flexible manufacturing capabilities allow us to create custom precast solutions for unique project needs.',
      items: ['Custom Designs', 'Variable Dimensions', 'Special Finishes'],
    },
  ];

  return (
    <PublicLayout>
      <PageHero
        eyebrow="What Sets Us Apart"
        title="Our Specialities"
        subtitle="The craft and standards behind every precast product we ship"
        image="/gallery/pavers-pattern-samples-yard-overview.jpeg"
      />

      {/* Specialities Cards */}
      {/* Specialities Cards */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="space-y-8">
            {specialities.map((spec, i) => {
              return (
                <div key={i} className="bg-white rounded-lg shadow-lg overflow-hidden">
                  <div className="grid md:grid-cols-2">
                    {/* Image Container - Replaces Icon */}
                    <div className="h-64 md:h-auto relative">
                      <img
                        src={spec.image}
                        alt={spec.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    <div className="p-12">
                      <h2 className="text-3xl font-bold mb-4 text-gray-900">{spec.title}</h2>
                      <p className="text-gray-600 mb-6 leading-relaxed">{spec.description}</p>
                      <div className="flex flex-wrap gap-3">
                        {spec.items.map((item, j) => (
                          <span
                            key={j}
                            className="bg-red-100 text-red-800 px-4 py-2 rounded-full text-sm font-semibold"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="text-white py-16" style={{ background: '#1a1a1a' }}>
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Our Achievements</h2>
          <div className="grid md:grid-cols-4 gap-8 text-center">
            {[
              { number: '50+', label: 'International Awards' },
              { number: '100%', label: 'Quality Rate' },
              { number: '15+', label: 'Manufacturing Units' },
              { number: '5M+', label: 'Units Produced' },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-4xl font-bold mb-2" style={{ color: '#ef4444' }}>{item.number}</div>
                <p className="text-gray-300">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
