import PublicLayout from '../layouts/PublicLayout';
import PageHero from '../components/PageHero';
import { useState } from 'react';
import { Phone, Mail, MapPin, MessageCircle, Check, Clock } from 'lucide-react';
import { alpha, ground, ink, serifNavy, btnNavy, btnOrange, orangeSoft, gothicType, sans } from '../homeTheme';
import { Title, Tag, PillButton } from '../components/Public/ui';
import { card, bodyStyle, fieldClass, fieldStyle, labelClass, labelStyle } from '../components/Public/styles';

const heading = { ...gothicType, color: ink };

export default function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const whatsappMessage = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nMessage: ${form.message}`
    );
    window.open(`https://wa.me/923457579505?text=${whatsappMessage}`, '_blank');
    setSubmitted(true);
    setTimeout(() => {
      setForm({ name: '', email: '', message: '' });
      setSubmitted(false);
    }, 2000);
  };

  const cards = [
    { Icon: MapPin, title: 'Address', lines: ['Sugar Mill Road, Near Kuthiala Sayedan', 'Mandi Bahauddin, Pakistan'] },
    { Icon: Phone, title: 'Phone', lines: ['Mirza Zahid Nasir: +92 345 7579505', 'Mirza Shoaib: +92 348 7236088'] },
    { Icon: Mail, title: 'Email', lines: ['nasir_mirza202@yahoo.com'] },
  ];

  return (
    <PublicLayout skin="home">
      <PageHero
        eyebrow="Let's Talk"
        title="Contact Us"
        subtitle="Get in touch with our team"
        image="/gallery/precast-boundary-wall-panels-2.webp"
      />

      {/* Contact cards */}
      <section className="pt-20 pb-10 bg-white">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-8">
          {cards.map((c) => {
            const Icon = c.Icon;
            return (
              <div key={c.title} className="rounded-2xl p-8" style={card}>
                <span className="grid h-12 w-12 place-items-center rounded-full text-white" style={{ background: btnOrange }}>
                  <Icon size={22} />
                </span>
                <h3 className="mt-6 uppercase" style={{ ...heading, fontSize: '2rem' }}>{c.title}</h3>
                <p className="mt-3 leading-relaxed break-words" style={bodyStyle}>
                  {c.lines.map((l, i) => <span key={l}>{i > 0 && <br />}{l}</span>)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Form + hours */}
      <section className="pt-10 pb-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12">
          {/* Form */}
          <div className="rounded-2xl p-8 md:p-10" style={{ ...card, background: ground }}>
            <Tag className="mb-4">Write to us</Tag>
            <Title font="serif">Send us a Message</Title>
            {submitted ? (
              <div className="mt-8 rounded-2xl p-8 text-center" style={card}>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full text-white" style={{ background: btnOrange }}>
                  <Check size={26} />
                </span>
                <p className="mt-4 font-bold" style={{ fontFamily: sans, color: ink }}>Message sent! We'll contact you shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <div>
                  <label className={labelClass} style={labelStyle}>Full Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="your@email.com"
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>Message *</label>
                  <textarea
                    required
                    rows="5"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Your message..."
                    className={`${fieldClass} resize-none`}
                    style={fieldStyle}
                  />
                </div>

                <PillButton type="submit" icon={MessageCircle} className="w-full">Send via WhatsApp</PillButton>
              </form>
            )}
          </div>

          {/* Hours */}
          <div>
            <Tag className="mb-4">When we're open</Tag>
            <Title>Business Hours</Title>
            <div className="mt-8 rounded-2xl p-8" style={card}>
              {[
                ['Monday - Friday', '9:00 AM - 6:00 PM'],
                ['Saturday', '10:00 AM - 4:00 PM'],
                ['Sunday', 'Closed'],
              ].map(([day, hours]) => (
                <div key={day} className="flex justify-between gap-4 py-4" style={{ borderBottom: `1px solid ${alpha(serifNavy, 0.12)}` }}>
                  <span className="font-bold" style={{ fontFamily: sans, color: ink }}>{day}</span>
                  <span style={bodyStyle}>{hours}</span>
                </div>
              ))}
              <p className="pt-5 text-sm" style={bodyStyle}>
                Contact us during business hours for quick responses. Emergency orders available 24/7.
              </p>
            </div>

            <div className="mt-8 flex gap-5 rounded-2xl p-8 text-white" style={{ background: btnNavy }}>
              <Clock className="shrink-0" size={28} style={{ color: orangeSoft }} />
              <div>
                <h3 className="uppercase" style={{ ...heading, color: '#fff', fontSize: '1.75rem' }}>Quick Response</h3>
                <p className="mt-2 text-white/80" style={{ fontFamily: sans }}>
                  Get instant support through WhatsApp. Our team responds within 2 hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
