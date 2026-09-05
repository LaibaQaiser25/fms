import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import LoginModal from '../components/Login';

export default function PublicLayout({ children }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const location = useLocation();

    const navItems = [
        { label: 'Home', path: '/' },
        { label: 'About', path: '/about' },
        { label: 'Services', path: '/services' },
        { label: 'Specialities', path: '/specialities' },
        { label: 'Feedback', path: '/feedback' },
        { label: 'Contact', path: '/contact' },
    ];

    const isActive = (path) => location.pathname === path;

    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* Navbar */}
            <nav style={{
                background: 'linear-gradient(135deg, #000000 0%, #05001a 40%, #000d08 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 4px 40px rgba(0,0,0,0.8), 0 1px 0 rgba(139,92,246,0.3)',
                backdropFilter: 'blur(12px)',
            }}>
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex justify-between items-center">

                        {/* Logo */}
                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden"
                                style={{
                                    boxShadow: '0 0 20px rgba(88,28,212,0.5), 0 0 40px rgba(5,150,105,0.3)',
                                }}>
                                <img src="../logo.png" alt="Bin-Zahid Logo" className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <div className="font-bold text-white text-lg leading-tight"
                                    style={{
                                        fontFamily: "'Cormorant Garamond', serif",
                                        fontSize: '1.4rem',
                                        fontWeight: '700',
                                        letterSpacing: '0.12em',
                                        textTransform: 'uppercase',
                                        textShadow: '0 0 20px rgba(139,92,246,0.4)',
                                    }}>
                                    Bin-Zahid & Partners'
                                </div>
                                <div className="text-xs" 
                                style={{
                                    fontFamily: "'Cormorant Garamond', serif",
                                    letterSpacing: '0.2em',
                                    textTransform: 'uppercase',
                                    color: 'rgba(52,211,153,0.7)',
                                }}>
                                    Precast Solutions
                                </div>
                            </div>
                        </Link>

                        {/* Desktop Nav */}
                        <div className="hidden md:flex items-center gap-7">
                            {navItems.map(item => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className="text-sm font-medium transition-all duration-200"
                                    style={{
                                        color: isActive(item.path) ? '#6ee7b7' : 'rgba(255,255,255,0.6)',
                                        borderBottom: isActive(item.path) ? '1px solid #6ee7b7' : '1px solid transparent',
                                        paddingBottom: '2px',
                                        textShadow: isActive(item.path) ? '0 0 12px rgba(110,231,183,0.6)' : 'none',
                                    }}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </div>

                        {/* Right Side */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setIsLoginOpen(true)}
                                className="hidden md:block text-sm font-bold px-6 py-2.5 rounded-lg transition-all duration-200"
                                style={{
                                    background: 'linear-gradient(135deg, #581cd4, #059669)',
                                    color: '#fff',
                                    boxShadow: '0 0 20px rgba(88,28,212,0.45), 0 0 40px rgba(5,150,105,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                                }}
                            >
                                Login
                            </button>
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="md:hidden p-2"
                                style={{ color: 'rgba(255,255,255,0.7)' }}
                            >
                                {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
                            </button>
                        </div>
                    </div>

                    {/* Mobile Menu */}
                    {isMenuOpen && (
                        <div className="md:hidden mt-4 pb-4"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                            {navItems.map(item => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setIsMenuOpen(false)}
                                    className="block py-2.5 text-sm font-medium transition-all"
                                    style={{ color: isActive(item.path) ? '#6ee7b7' : 'rgba(255,255,255,0.55)' }}
                                >
                                    {item.label}
                                </Link>
                            ))}
                            <button
                                onClick={() => { setIsLoginOpen(true); setIsMenuOpen(false); }}
                                className="mt-4 w-full py-2.5 rounded-lg font-bold text-sm"
                                style={{
                                    background: 'linear-gradient(135deg, #581cd4, #059669)',
                                    color: '#fff',
                                    boxShadow: '0 0 20px rgba(88,28,212,0.4)',
                                }}
                            >
                                Login
                            </button>
                        </div>
                    )}
                </div>
            </nav>

            {/* Main Content */}
            <main className="flex-1">
                {children}
            </main>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-green-400">About Us</h3>
                            <p className="text-gray-300 text-sm">Leading precast concrete solutions for modern construction.</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-green-400">Quick Links</h3>
                            <ul className="text-gray-300 text-sm space-y-2">
                                <li><Link to="/about" className="hover:text-green-400">About</Link></li>
                                <li><Link to="/services" className="hover:text-green-400">Services</Link></li>
                                <li><Link to="/contact" className="hover:text-green-400">Contact</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-green-400">Contact</h3>
                            <p className="text-gray-300 text-sm">Sugar Mill Road, Near Kuthiala Sayedan, Mandi Bahauddin</p>
                            <p className="text-gray-300 text-sm mt-2">Email: nasir_mirza202@yahoo.com</p>
                            <p className="text-gray-300 text-sm">Mirza Zahid Nasir: +92 345 7579505</p>
                            <p className="text-gray-300 text-sm">Mirza Shoaib: +92 348 7236088</p>
                            <a
                                href="https://wa.me/923457579505"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-400 text-sm hover:underline inline-block mt-1"
                            >
                                WhatsApp us anytime
                            </a>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-green-400">Follow Us</h3>
                            <p className="text-gray-300 text-sm">Facebook: اتفاق بلڈرز کی تیار چھتیں اور دیواریں منڈی بہاؤالدین</p>
                        </div>
                    </div>
                    <div className="border-t border-gray-700 pt-8 text-center text-gray-400 text-sm">
                        <p>&copy; 2024 Bin-Zahid & Partners. All rights reserved.</p>
                    </div>
                </div>
            </footer>

            {/* Login Modal */}
            <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
        </div>
    );
}
