import PublicLayout from '../layouts/PublicLayout';
import { useState } from 'react';
import { Star } from 'lucide-react';

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
    <PublicLayout>
      {/* Hero Section */}
      <div className="bg-blue-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl font-bold mb-4">Customer Feedback</h1>
          <p className="text-xl text-blue-100">We value your experience and suggestions</p>
        </div>
      </div>

      {/* Feedback Form */}
      <div className="py-16">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg p-8 md:p-12">
            {submitted ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="text-2xl font-bold text-green-600 mb-2">Thank You!</h2>
                <p className="text-gray-600">Your feedback has been received. We appreciate your input!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Name Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter your full name"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-green-600"
                  />
                </div>

                {/* Rating */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setForm({ ...form, rating: star })}
                        className={`transition ${
                          star <= form.rating
                            ? 'text-yellow-400'
                            : 'text-gray-300'
                        }`}
                      >
                        <Star size={32} fill="currentColor" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Your Message *</label>
                  <textarea
                    required
                    rows="6"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Share your feedback, suggestions, or experience with us..."
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-green-600 resize-none"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-green-600 text-white py-3 rounded-lg font-bold hover:shadow-lg transition"
                >
                  Submit Feedback
                </button>
              </form>
            )}
          </div>

          {/* Testimonials */}
          <div className="mt-16">
            <h2 className="text-3xl font-bold text-center mb-12">What Our Clients Say</h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { name: 'Ahmed Khan', company: 'Khan Construction', text: 'Exceptional quality and timely delivery. Highly recommend!' },
                { name: 'Fatima Ali', company: 'Modern Builders', text: 'Professional team, premium products. Great experience!' },
                { name: 'Hassan Raza', company: 'BuildRight Ltd', text: 'Innovative solutions and excellent customer support.' },
              ].map((testimonial, i) => (
                <div key={i} className="bg-gray-50 p-6 rounded-lg">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} size={16} className="text-yellow-400" fill="currentColor" />
                    ))}
                  </div>
                  <p className="text-gray-600 mb-4 italic">"{testimonial.text}"</p>
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.company}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
