import PublicLayout from '../layouts/PublicLayout';
import PageHero from '../components/PageHero';
import { Users, Award, Zap } from 'lucide-react';

export default function AboutPage() {
  const team = [
    { name: 'Mirza Zahid Nasir', role: 'Founder & Partner', image: '👨‍💼' },
    { name: 'Mirza Shoaib', role: 'Partner', image: '👨‍💼' },
    { name: 'Sagar Ali Mangat', role: 'Manager', image: '👨‍🔧' },
    { name: 'Syed Usama Shah', role: 'Manager', image: '👨‍🔧' },
  ];

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Since 2005"
        title="About Bin-Zahid & Partners"
        subtitle="Building Dreams with Precision"
        image="/gallery/concrete-slab-molds-curing-yard-1.jpeg"
      />

      {/* Company Description */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6 text-gray-900">Our Story</h2>
              <p className="text-gray-600 mb-4">
                Founded in 2005, Bin-Zahid & Partners has been at the forefront of precast concrete manufacturing in South Asia. What started as a small operation has grown into a leading supplier of innovative precast solutions.
              </p>
              <p className="text-gray-600 mb-4">
                Our commitment to quality, innovation, and customer satisfaction has made us the trusted partner for construction projects of all scales.
              </p>
              <p className="text-gray-600">
                Today, we employ over 200 skilled professionals and operate state-of-the-art manufacturing facilities across multiple regions.
              </p>
            </div>
            <div className="rounded-lg h-80 overflow-hidden shadow-lg">
              <img
                src="/gallery/workers-laying-diamond-pavers-house.jpeg"
                alt="Our team laying precast pavers on-site"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { number: '1000+', label: 'Projects Completed' },
              { number: '500+', label: 'Active Clients' },
              { number: '19', label: 'Years in Business' },
              { number: '200+', label: 'Expert Staff' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-bold text-red-700 mb-2">{stat.number}</div>
                <p className="text-gray-600">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Facility Gallery */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Inside Our Facility</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { src: '/gallery/pavers-pattern-samples-yard-overview.jpeg', label: 'Curing Yard' },
              { src: '/gallery/precast-beam-ceiling-brick-columns.jpeg', label: 'Precast Beam Production' },
              { src: '/gallery/concrete-drain-pipes-stacked-pyramid.jpeg', label: 'Drainage Pipe Manufacturing' },
            ].map((item) => (
              <div key={item.src} className="rounded-lg overflow-hidden h-56 shadow group relative">
                <img src={item.src} alt={item.label} className="w-full h-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                <div className="absolute inset-0 flex items-end p-4" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.65) 100%)' }}>
                  <p className="text-white text-sm font-semibold">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Values Section */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Our Values</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-lg shadow">
              <Award className="text-red-700 mb-4" size={32} />
              <h3 className="text-xl font-bold mb-3">Quality First</h3>
              <p className="text-gray-600">Every product undergoes rigorous testing to meet international standards.</p>
            </div>
            <div className="bg-white p-8 rounded-lg shadow">
              <Zap className="text-red-900 mb-4" size={32} />
              <h3 className="text-xl font-bold mb-3">Innovation</h3>
              <p className="text-gray-600">We invest in R&D to create cutting-edge precast solutions.</p>
            </div>
            <div className="bg-white p-8 rounded-lg shadow">
              <Users className="text-gray-700 mb-4" size={32} />
              <h3 className="text-xl font-bold mb-3">Customer Focus</h3>
              <p className="text-gray-600">Your success is our success - we're committed to excellence.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Team Section */}
      <div className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Leadership Team</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {team.map((member, i) => (
              <div key={i} className="bg-white rounded-lg overflow-hidden shadow text-center">
                <div className="bg-gradient-to-br from-gray-100 to-red-100 py-12 text-5xl">
                  {member.image}
                </div>
                <div className="p-6">
                  <h3 className="font-bold text-lg mb-1">{member.name}</h3>
                  <p className="text-red-700 font-semibold text-sm">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
