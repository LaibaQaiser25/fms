import PublicLayout from '../layouts/PublicLayout';
import PageHero from '../components/PageHero';
import { useState } from 'react';
import { Star, Check, Send } from 'lucide-react';
import { alpha, orangeText, ground, ink, serifNavy, btnOrange, serif, sans } from '../homeTheme';
import { SectionTitle, Title, PillButton } from '../components/Public/ui';
import { card, bodyStyle, fieldClass, fieldStyle, labelClass, labelStyle } from '../components/Public/styles';

export default function FeedbackPage() {
  const [form, setForm] = useState({
    name: '',
    message: '',
    rating: 5,
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setForm({ name: '', message: '', rating: 5 });
      setSubmitted(false);
    }, 3000);
  };

  return (
    <PublicLayout skin="home">
      <PageHero
        eyebrow="Tell Us What You Think"
        title="Customer Feedback"
        subtitle="We value your experience and suggestions"
        image="/gallery/clover-pavers-driveway-house.webp"
      />

      {/* Feedback Form */}
      <section className="py-20 bg-white">
        <div className="max-w-2xl mx-auto px-6">
          <div className="rounded-2xl p-8 md:p-12" style={card}>
            {submitted ? (
              <div className="py-12 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full text-white" style={{ background: btnOrange }}>
                  <Check size={30} />
                </span>
                <Title className="mt-6" font="serif">Thank You!</Title>
                <p className="mt-3" style={bodyStyle}>Your feedback has been received. We appreciate your input!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <Title font="serif">Share Your Experience</Title>

                {/* Name Field */}
                <div>
                  <label className={labelClass} style={labelStyle}>Your Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter your full name"
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>

                {/* Rating */}
                <div>
                  <label className={labelClass} style={labelStyle}>Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        aria-label={`${star} star${star > 1 ? 's' : ''}`}
                        onClick={() => setForm({ ...form, rating: star })}
                        className="transition hover:scale-110"
                        style={{ color: star <= form.rating ? btnOrange : alpha(serifNavy, 0.18) }}
                      >
                        <Star size={32} fill="currentColor" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message Field */}
                <div>
                  <label className={labelClass} style={labelStyle}>Your Message *</label>
                  <textarea
                    required
                    rows="6"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Share your feedback, suggestions, or experience with us..."
                    className={`${fieldClass} resize-none`}
                    style={fieldStyle}
                  />
                </div>

                <PillButton type="submit" icon={Send} className="w-full">Submit Feedback</PillButton>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20" style={{ background: ground }}>
        <div className="max-w-7xl mx-auto px-6">
          <SectionTitle tag="Testimonials" title="What Our Clients Say" center />
          <div className="mt-12 grid md:grid-cols-3 gap-8">
            {[
              { name: 'Ahmed Khan', company: 'Khan Construction', text: 'Exceptional quality and timely delivery. Highly recommend!' },
              { name: 'Fatima Ali', company: 'Modern Builders', text: 'Professional team, premium products. Great experience!' },
              { name: 'Hassan Raza', company: 'BuildRight Ltd', text: 'Innovative solutions and excellent customer support.' },
            ].map((testimonial) => (
              <figure key={testimonial.name} className="flex flex-col rounded-2xl p-8" style={card}>
                <div className="flex gap-1" style={{ color: btnOrange }}>
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} size={16} fill="currentColor" />
                  ))}
                </div>
                <blockquote className="mt-5 flex-1 text-xl italic leading-snug" style={{ fontFamily: serif, color: ink }}>
                  “{testimonial.text}”
                </blockquote>
                <figcaption className="mt-6 pt-5" style={{ borderTop: `1px solid ${alpha(serifNavy, 0.12)}` }}>
                  <p className="font-bold" style={{ fontFamily: sans, color: ink }}>{testimonial.name}</p>
                  <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.16em]" style={{ fontFamily: sans, color: orangeText }}>{testimonial.company}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
