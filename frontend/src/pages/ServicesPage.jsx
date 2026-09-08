import PublicLayout from '../layouts/PublicLayout';
import PageHero from '../components/PageHero';
import { Building2, Home, Factory, Zap } from 'lucide-react';

export default function ServicesPage() {
  const services = [
    {
      icon: Home,
      title: 'Residential Precast',
      description: 'High-quality precast elements for residential buildings including stairs, columns, and beams.',
      image: '/gallery/white-balustrade-railing-with-post-cap.jpeg',
    },
    {
      icon: Building2,
      title: 'Commercial Solutions',
      description: 'Customized precast products designed for commercial and retail construction projects.',
      image: '/gallery/slate-look-pavers-driveway-grey.jpeg',
    },
    {
      icon: Factory,
      title: 'Industrial Components',
      description: 'Heavy-duty precast units engineered for industrial applications and warehouses.',
      image: '/gallery/precast-beam-ceiling-brick-columns.jpeg',
    },
    {
      icon: Zap,
      title: 'Custom Design',
      description: 'Bespoke precast solutions tailored to your specific project requirements.',
      image: '/gallery/star-pattern-pavers.jpeg',
    },
    {
      icon: Building2,
      title: 'Bridge Components',
      description: 'Specialized precast units for infrastructure and bridge construction projects.',
      image: '/gallery/concrete-drain-pipes-stacked-pyramid.jpeg',
    },
    {
      icon: Home,
      title: 'Finishing Solutions',
      description: 'Aesthetic precast panels and finishes for modern architectural designs.',
      image: '/gallery/hexagon-textured-pavers-closeup.jpeg',
    },
  ];

  return (
    <PublicLayout>
      <PageHero
        eyebrow="What We Do"
        title="Our Services"
        subtitle="Comprehensive precast solutions for every project"
        image="/gallery/precast-beam-ceiling-brick-columns.jpeg"
      />

      {/* Services Grid */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {services.map((service, i) => {
              const Icon = service.icon;
              return (
                <div key={i} className="bg-white rounded-lg shadow hover:shadow-lg hover:-translate-y-1 transition overflow-hidden">
                  <div className="relative h-44">
                    <img src={service.image} alt={service.title} className="w-full h-full object-cover" />
                    <div className="absolute -bottom-5 left-6 w-12 h-12 rounded-xl bg-white shadow flex items-center justify-center">
                      <Icon className="text-green-600" size={22} />
                    </div>
                  </div>
                  <div className="p-8 pt-9">
                    <h3 className="text-xl font-bold mb-3 text-gray-900">{service.title}</h3>
                    <p className="text-gray-600">{service.description}</p>
                    <button className="mt-6 text-green-600 font-semibold hover:text-green-700">
                      Learn More →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Service Highlights</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              { title: 'Fast Delivery', desc: 'Quick turnaround without compromising quality' },
              { title: 'Expert Installation', desc: 'Professional support throughout installation' },
              { title: 'Cost Effective', desc: 'Competitive pricing with superior quality' },
              { title: 'Durability', desc: '50+ year lifespan with minimal maintenance' },
            ].map((item, i) => (
              <div key={i} className="bg-white p-8 rounded-lg border-l-4 border-green-600">
                <h3 className="text-lg font-bold mb-2 text-gray-900">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
