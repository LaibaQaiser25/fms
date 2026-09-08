import PublicLayout from '../layouts/PublicLayout';
import PageHero from '../components/PageHero';
import { useState } from 'react';
import { Phone, Mail, MapPin, MessageCircle } from 'lucide-react';

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

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Let's Talk"
        title="Contact Us"
        subtitle="Get in touch with our team"
        image="/gallery/precast-boundary-wall-panels-2.jpeg"
      />

      {/* Contact Section */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {/* Address Card */}
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <MapPin className="text-blue-600 mx-auto mb-4" size={40} />
              <h3 className="text-xl font-bold mb-2">Address</h3>
              <p className="text-gray-600">
                Sugar Mill Road, Near Kuthiala Sayedan<br />
                Mandi Bahauddin, Pakistan
              </p>
            </div>

            {/* Phone Card */}
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <Phone className="text-green-600 mx-auto mb-4" size={40} />
              <h3 className="text-xl font-bold mb-2">Phone</h3>
              <p className="text-gray-600">
                Mirza Zahid Nasir: +92 345 7579505<br />
                Mirza Shoaib: +92 348 7236088
              </p>
            </div>

            {/* Email Card */}
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <Mail className="text-purple-600 mx-auto mb-4" size={40} />
              <h3 className="text-xl font-bold mb-2">Email</h3>
              <p className="text-gray-600">
                nasir_mirza202@yahoo.com
              </p>
            </div>
          </div>

          {/* Contact Form */}
          <div className="grid md:grid-cols-2 gap-12">
            {/* Form */}
            <div>
              <h2 className="text-3xl font-bold mb-8">Send us a Message</h2>
              {submitted ? (
                <div className="bg-green-50 p-8 rounded-lg text-center">
                  <div className="text-4xl mb-3">✓</div>
                  <p className="text-green-700 font-semibold">Message sent! We'll contact you shortly.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Your name"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-green-600"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="your@email.com"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-green-600"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Message *</label>
                    <textarea
                      required
                      rows="5"
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Your message..."
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-green-600 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-green-600 text-white py-3 rounded-lg font-bold hover:shadow-lg transition flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={20} />
                    Send via WhatsApp
                  </button>
                </form>
              )}
            </div>

            {/* Map/Info */}
            <div>
              <h2 className="text-3xl font-bold mb-8">Business Hours</h2>
              <div className="bg-gray-50 rounded-lg p-8 space-y-4">
                <div className="flex justify-between pb-4 border-b">
                  <span className="font-semibold text-gray-900">Monday - Friday</span>
                  <span className="text-gray-600">9:00 AM - 6:00 PM</span>
                </div>
                <div className="flex justify-between pb-4 border-b">
                  <span className="font-semibold text-gray-900">Saturday</span>
                  <span className="text-gray-600">10:00 AM - 4:00 PM</span>
                </div>
                <div className="flex justify-between pb-4 border-b">
                  <span className="font-semibold text-gray-900">Sunday</span>
                  <span className="text-gray-600">Closed</span>
                </div>
                <div className="pt-4">
                  <p className="text-gray-600 text-sm">
                    Contact us during business hours for quick responses. Emergency orders available 24/7.
                  </p>
                </div>
              </div>

              <div className="mt-8 bg-blue-50 p-8 rounded-lg border-l-4 border-blue-600">
                <h3 className="font-bold text-lg mb-2 text-blue-900">Quick Response</h3>
                <p className="text-blue-800">
                  Get instant support through WhatsApp. Our team responds within 2 hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
