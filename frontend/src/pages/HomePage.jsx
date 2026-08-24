import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Clock, Users, Award, BarChart } from 'lucide-react';
import PublicLayout from '../layouts/PublicLayout';

const HERO_STATS = [
  { value: '30+', label: 'Years Experience', icon: <Award size={24} className="text-[#6ee7b7]" /> },
  { value: '500+', label: 'Projects Done', icon: <BarChart size={24} className="text-[#6ee7b7]" /> },
  { value: '200+', label: 'Happy Clients', icon: <Users size={24} className="text-[#6ee7b7]" /> },
];

const STRENGTHS = [
  { icon: Shield, title: 'Quality Guaranteed', desc: 'ISO certified manufacturing with strict quality control at every stage.', glow: 'rgba(99,102,241,0.3)', accent: '#818cf8' },
  { icon: Clock, title: 'On-Time Delivery', desc: 'Reliable logistics ensuring your projects always stay on schedule.', glow: 'rgba(16,185,129,0.3)', accent: '#6ee7b7' },
  { icon: Users, title: 'Expert Team', desc: 'Decades of combined experience in precast construction and engineering.', glow: 'rgba(59,130,246,0.3)', accent: '#93c5fd' },
];

const BANNER_STATS = [
  { value: '500+', label: 'Projects Completed' },
  { value: '30+', label: 'Years Experience' },
  { value: '200+', label: 'Happy Clients' },
  { value: '50+', label: 'Expert Engineers' },
];

export default function HomePage() {
  return (
    <PublicLayout>

      {/* ---------------------------------- Hero ---------------------------------- */}
      <section className="relative text-white pt-16 pb-24 md:pt-24 md:pb-28 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0f0c29 0%, #1a1a6e 25%, #0d4f3c 60%, #0a2e1a 100%)',
        }}>

        {/* 3D layered glow orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div style={{
            position: 'absolute', top: '-10%', left: '-5%',
            width: '600px', height: '600px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
          <div style={{
            position: 'absolute', bottom: '-15%', right: '-5%',
            width: '700px', height: '700px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }} />
          <div style={{
            position: 'absolute', top: '40%', left: '40%',
            width: '400px', height: '400px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 70%)',
            filter: 'blur(50px)',
          }} />
        </div>

        {/* grid lines */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        <div className="relative max-w-7xl mx-auto px-6">

          {/* Headline + visual */}
          <div className="grid md:grid-cols-2 items-center gap-12 lg:gap-16">

            {/* Left: text content */}
            <div className="text-center md:text-left">
              <span className="inline-block px-5 py-2 rounded-full text-xs font-bold tracking-widest uppercase mb-8"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#6ee7b7',
                  backdropFilter: 'blur(10px)',
                }}>
                Est. Since 1990 · ISO Certified
              </span>

              <h1 className="font-bold leading-tight mb-6"
                style={{
                  fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
                  background: 'linear-gradient(135deg, #ffffff 0%, #a5f3d0 40%, #818cf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                Premium Precast<br />Solutions
              </h1>

              <p className="text-lg leading-relaxed mb-10 max-w-lg mx-auto md:mx-0"
                style={{ color: 'rgba(255,255,255,0.65)' }}>
                Bin-Zahid &amp; Partners delivers world-class precast concrete products — durable, cost-effective, and always on time.
              </p>

              <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                <Link to="/services"
                  className="inline-flex items-center gap-2 font-bold px-8 py-4 rounded-xl transition hover:opacity-90"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#fff',
                    boxShadow: '0 8px 32px rgba(16,185,129,0.4)',
                  }}>
                  Explore Services <ArrowRight size={18} />
                </Link>
                <Link to="/contact"
                  className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-xl transition hover:bg-white/10"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    backdropFilter: 'blur(10px)',
                  }}>
                  Contact Us
                </Link>
              </div>
            </div>

            {/* Right: visual */}
            <div className="relative w-full max-w-lg mx-auto md:max-w-none">
              {/* Decorative glow behind image */}
              <div className="absolute -inset-4 bg-emerald-500/20 blur-3xl rounded-full" />

              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <img
                  src="../pic1.jpg"
                  alt="Premium Precast Concrete"
                  className="w-full h-auto object-cover transform hover:scale-105 transition duration-700"
                />
                {/* Subtle overlay to match the dark theme */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f0c29]/60 to-transparent" />
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 md:mt-24">
            {HERO_STATS.map((s) => (
              <div key={s.label}
                className="flex flex-col items-start p-8 rounded-3xl transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 100%)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(24px)',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                }}>

                <div className="mb-6 p-4 rounded-2xl bg-[#6ee7b7]/10 border border-[#6ee7b7]/20 shadow-inner">
                  {s.icon}
                </div>

                <p className="text-4xl font-extrabold mb-2"
                  style={{
                    color: '#6ee7b7',
                    textShadow: '0 0 30px rgba(110,231,183,0.4)',
                  }}>
                  {s.value}
                </p>

                <p className="text-sm font-bold tracking-widest uppercase mb-4"
                  style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {s.label}
                </p>

                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Delivering excellence and quality precast solutions across the region with precision and durability.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------ Why Choose Us ------------------------------ */}
      <section className="py-24"
        style={{ background: 'linear-gradient(180deg, #0a0a1a 0%, #0d1f2d 50%, #0a1a12 100%)' }}>
        <div className="max-w-7xl mx-auto px-6">

          <header className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6ee7b7' }}>Our Strengths</span>
            <h2 className="text-4xl font-bold mt-3" style={{
              background: 'linear-gradient(135deg, #fff 0%, #a5f3d0 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>Why Choose Us</h2>
          </header>

          <div className="grid md:grid-cols-3 gap-8">
            {STRENGTHS.map(({ icon: Icon, title, desc, glow, accent }) => (
              <div key={title}
                className="relative p-8 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: `0 0 40px ${glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: `${glow}`, border: `1px solid ${accent}30` }}>
                  <Icon size={22} style={{ color: accent }} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------- Stats Banner ------------------------------ */}
      <section className="py-16" style={{
        background: 'linear-gradient(135deg, #0f0c29 0%, #1a1a6e 40%, #0d4f3c 100%)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {BANNER_STATS.map((s) => (
              <div key={s.label}>
                <p className="text-4xl font-bold" style={{ color: '#6ee7b7' }}>{s.value}</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------- CTA ----------------------------------- */}
      <section className="py-24 text-center"
        style={{ background: 'linear-gradient(180deg, #0a1a12 0%, #0a0a1a 100%)' }}>
        <div className="max-w-2xl mx-auto px-6">
          <Award size={42} style={{ color: '#6ee7b7', margin: '0 auto 1.5rem' }} />
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Start Your Project?</h2>
          <p className="mb-10" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Get in touch with our team today for a free consultation and quote.
          </p>
          <Link to="/contact"
            className="inline-flex items-center gap-2 font-bold px-10 py-4 rounded-xl transition"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #10b981)',
              color: '#fff',
              boxShadow: '0 8px 32px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}>
            Contact Us Now <ArrowRight size={18} />
          </Link>
        </div>
      </section>

    </PublicLayout>
  );
}
