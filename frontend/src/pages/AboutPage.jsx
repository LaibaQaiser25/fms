import PublicLayout from '../layouts/PublicLayout';
import PageHero from '../components/PageHero';
import { Users, Award, Zap } from 'lucide-react';
import { alpha, orangeText, ground, ink, serifNavy, btnNavy, btnOrange, gothicType, sans } from '../homeTheme';
import { SectionTitle, Tag } from '../components/Public/ui';
import { card, bodyStyle } from '../components/Public/styles';

const initials = (name) => name.split(' ').filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('');

export default function AboutPage() {
  const team = [
    { name: 'Mirza Zahid Nasir', role: 'Founder & Partner' },
    { name: 'Mirza Shoaib', role: 'Partner' },
    { name: 'Sagar Ali Mangat', role: 'Manager' },
    { name: 'Syed Usama Shah', role: 'Manager' },
  ];

  return (
    <PublicLayout skin="home">
      <PageHero
        eyebrow="Since 2005"
        title="About Bin-Zahid & Partners"
        subtitle="Building Dreams with Precision"
        image="/gallery/concrete-slab-molds-curing-yard-1.webp"
      />

      {/* Company Description */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-14 items-center">
            <div>
              <SectionTitle tag="Who we are" title="Our Story" font="serif" />
              <div className="mt-6 space-y-4 leading-relaxed" style={bodyStyle}>
                <p>
                  Founded in 2005, Bin-Zahid & Partners has been at the forefront of precast concrete manufacturing in South Asia. What started as a small operation has grown into a leading supplier of innovative precast solutions.
                </p>
                <p>
                  Our commitment to quality, innovation, and customer satisfaction has made us the trusted partner for construction projects of all scales.
                </p>
                <p>
                  Today, we employ over 200 skilled professionals and operate state-of-the-art manufacturing facilities across multiple regions.
                </p>
              </div>
            </div>
            <div className="relative">
              <div aria-hidden="true" className="absolute inset-0 translate-x-3.5 translate-y-3.5 rounded-2xl"
                style={{ border: `1px solid ${alpha(serifNavy, 0.45)}` }} />
              <img
                src="/gallery/workers-laying-diamond-pavers-house.webp"
                alt="Our team laying precast pavers on-site"
                className="relative h-80 w-full rounded-2xl object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section style={{ background: ground, borderTop: `1px solid ${alpha(serifNavy, 0.12)}`, borderBottom: `1px solid ${alpha(serifNavy, 0.12)}` }}>
        <div className="max-w-7xl mx-auto grid grid-cols-2 gap-px md:grid-cols-4" style={{ background: alpha(serifNavy, 0.12) }}>
          {[
            { number: '1000+', label: 'Projects Completed' },
            { number: '500+', label: 'Active Clients' },
            { number: '19', label: 'Years in Business' },
            { number: '200+', label: 'Expert Staff' },
          ].map((stat) => (
            <div key={stat.label} className="px-4 py-12 text-center" style={{ background: ground }}>
              <div style={{ ...gothicType, fontSize: 'clamp(3rem, 6vw, 4.5rem)', color: btnOrange }}>
                {stat.number}
              </div>
              <Tag className="mt-3 text-[0.7rem]">{stat.label}</Tag>
            </div>
          ))}
        </div>
      </section>

      {/* Facility Gallery */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <SectionTitle tag="On the ground" title="Inside Our Facility" center />
          <div className="mt-12 grid md:grid-cols-3 gap-8">
            {[
              { src: '/gallery/pavers-pattern-samples-yard-overview.webp', label: 'Curing Yard' },
              { src: '/gallery/precast-beam-ceiling-brick-columns.webp', label: 'Precast Beam Production' },
              { src: '/gallery/concrete-drain-pipes-stacked-pyramid.webp', label: 'Drainage Pipe Manufacturing' },
            ].map((item) => (
              <figure key={item.src} className="group">
                <div className="h-56 overflow-hidden rounded-2xl">
                  <img src={item.src} alt={item.label} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                </div>
                <figcaption className="mt-4 flex items-center gap-3 text-sm font-bold uppercase tracking-[0.14em]" style={{ fontFamily: sans, color: ink }}>
                  <span className="h-px w-8" style={{ background: btnOrange }} />
                  {item.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20" style={{ background: ground }}>
        <div className="max-w-7xl mx-auto px-6">
          <SectionTitle tag="What drives us" title="Our Values" font="serif" center />
          <div className="mt-12 grid md:grid-cols-3 gap-8">
            {[
              { Icon: Award, title: 'Quality First', text: 'Every product undergoes rigorous testing to meet international standards.' },
              { Icon: Zap, title: 'Innovation', text: 'We invest in R&D to create cutting-edge precast solutions.' },
              { Icon: Users, title: 'Customer Focus', text: "Your success is our success - we're committed to excellence." },
            ].map(({ Icon: icon, title, text }) => {
              const Icon = icon;
              return (
              <div key={title} className="rounded-2xl p-8" style={card}>
                <span className="grid h-12 w-12 place-items-center rounded-full text-white" style={{ background: btnOrange }}>
                  <Icon size={22} />
                </span>
                <h3 className="mt-6" style={{ ...gothicType, fontSize: '2rem', color: ink }}>{title}</h3>
                <p className="mt-3 leading-relaxed" style={bodyStyle}>{text}</p>
              </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <SectionTitle tag="The people" title="Leadership Team" center />
          <div className="mt-12 grid sm:grid-cols-2 md:grid-cols-4 gap-8">
            {team.map((member) => (
              <div key={member.name} className="overflow-hidden rounded-2xl text-center" style={card}>
                <div className="grid h-40 place-items-center" style={{ background: btnNavy }}>
                  <span className="text-white" style={{ ...gothicType, fontSize: '4rem' }}>
                    {initials(member.name)}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-bold" style={{ fontFamily: sans, color: ink }}>{member.name}</h3>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em]" style={{ fontFamily: sans, color: orangeText }}>{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
