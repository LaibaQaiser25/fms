import PublicLayout from '../layouts/PublicLayout';
import { Lightbulb, Shield, Leaf, Sliders } from 'lucide-react';

export default function SpecialitiesPage() {
  const specialities = [
    {
      image: '../pic3.jpg', // Replace with your image path
      title: 'Innovation',
      description: 'We invest heavily in research and development to create innovative precast solutions that meet evolving market demands.',
      items: ['3D CAD Design', 'Advanced Manufacturing', 'Material Innovation'],
    },
    {
      image: '../pic4.jpg',
      title: 'Quality Assurance',
      description: 'Rigorous testing and inspection at every stage ensures products meet or exceed international standards.',
      items: ['ISO 9001 Certified', 'Regular Audits', 'Lab Testing'],
    },
    {
      image: '../pic5.jpg',
      title: 'Sustainability',
      description: 'Eco-friendly manufacturing practices and sustainable material sourcing are core to our operations.',
      items: ['Green Manufacturing', 'Waste Reduction', 'Recycled Materials'],
    },
    {
      image: '../pic1.jpg',
      title: 'Customization',
      description: 'Flexible manufacturing capabilities allow us to create custom precast solutions for unique project needs.',
      items: ['Custom Designs', 'Variable Dimensions', 'Special Finishes'],
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-900 to-green-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl font-bold mb-4">Our Specialities</h1>
          <p className="text-xl text-blue-100">What sets us apart in the industry</p>
        </div>
      </div>

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
                      />
                    </div>

                    <div className="p-12">
                      <h2 className="text-3xl font-bold mb-4 text-gray-900">{spec.title}</h2>
                      <p className="text-gray-600 mb-6 leading-relaxed">{spec.description}</p>
                      <div className="flex flex-wrap gap-3">
                        {spec.items.map((item, j) => (
                          <span
                            key={j}
                            className="bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-semibold"
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
      <div className="bg-blue-900 text-white py-16">
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
                <div className="text-4xl font-bold text-green-400 mb-2">{item.number}</div>
                <p className="text-blue-100">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
