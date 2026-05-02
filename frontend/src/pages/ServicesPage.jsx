import PublicLayout from '../layouts/PublicLayout';
import { Building2, Home, Factory, Zap } from 'lucide-react';

export default function ServicesPage() {
  const services = [
    {
      icon: Home,
      title: 'Residential Precast',
      description: 'High-quality precast elements for residential buildings including stairs, columns, and beams.',
    },
    {
      icon: Building2,
      title: 'Commercial Solutions',
      description: 'Customized precast products designed for commercial and retail construction projects.',
    },
    {
      icon: Factory,
      title: 'Industrial Components',
      description: 'Heavy-duty precast units engineered for industrial applications and warehouses.',
    },
    {
      icon: Zap,
      title: 'Custom Design',
      description: 'Bespoke precast solutions tailored to your specific project requirements.',
    },
    {
      icon: Building2,
      title: 'Bridge Components',
      description: 'Specialized precast units for infrastructure and bridge construction projects.',
    },
    {
      icon: Home,
      title: 'Finishing Solutions',
      description: 'Aesthetic precast panels and finishes for modern architectural designs.',
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <div className="bg-green-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl font-bold mb-4">Our Services</h1>
          <p className="text-xl text-green-100">Comprehensive precast solutions for every project</p>
        </div>
      </div>

      {/* Services Grid */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {services.map((service, i) => {
              const Icon = service.icon;
              return (
                <div key={i} className="bg-white p-8 rounded-lg shadow hover:shadow-lg hover:-translate-y-1 transition">
                  <Icon className="text-green-600 mb-4" size={40} />
                  <h3 className="text-xl font-bold mb-3 text-gray-900">{service.title}</h3>
                  <p className="text-gray-600">{service.description}</p>
                  <button className="mt-6 text-green-600 font-semibold hover:text-green-700">
                    Learn More →
                  </button>
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
