import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import LoginModal from '../components/Login';

export default function PublicLayout({ children }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [navHidden, setNavHidden] = useState(false);
    const lastScrollY = useRef(0);
    const location = useLocation();

    useEffect(() => {
        const handleScroll = () => {
            const currentY = window.scrollY;
            if (currentY > lastScrollY.current && currentY > 80) {
                setNavHidden(true);
            } else {
                setNavHidden(false);
            }
            lastScrollY.current = currentY;
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

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
            <nav className="sticky top-0 z-50" style={{
                background: '#1a1a1a',
                borderBottom: '3px solid #b91c1c',
                boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                transform: navHidden ? 'translateY(-100%)' : 'translateY(0)',
                transition: 'transform 0.3s ease',
            }}>
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex justify-between items-center">

                        {/* Logo */}
                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden"
                                style={{ border: '1px solid #b91c1c' }}>
                                <img src="../logo.jpeg" alt="Bin-Zahid Logo" className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <div className="font-bold text-white text-lg leading-tight"
                                    style={{
                                        fontFamily: "'Cormorant Garamond', serif",
                                        fontSize: '1.4rem',
                                        fontWeight: '700',
                                        letterSpacing: '0.12em',
                                        textTransform: 'uppercase',
                                    }}>
                                    Bin-Zahid & Partners'
                                </div>
                                <div className="text-xs"
                                style={{
                                    fontFamily: "'Cormorant Garamond', serif",
                                    letterSpacing: '0.2em',
                                    textTransform: 'uppercase',
                                    color: '#ef4444',
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
                                        color: isActive(item.path) ? '#ef4444' : 'rgba(255,255,255,0.65)',
                                        borderBottom: isActive(item.path) ? '2px solid #ef4444' : '2px solid transparent',
                                        paddingBottom: '2px',
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
                                className="hidden md:block text-sm font-bold px-6 py-2.5 rounded-lg transition hover:opacity-90"
                                style={{
                                    background: '#b91c1c',
                                    color: '#fff',
                                    boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
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
                            style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            {navItems.map(item => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setIsMenuOpen(false)}
                                    className="block py-2.5 text-sm font-medium transition-all"
                                    style={{ color: isActive(item.path) ? '#ef4444' : 'rgba(255,255,255,0.6)' }}
                                >
                                    {item.label}
                                </Link>
                            ))}
                            <button
                                onClick={() => { setIsLoginOpen(true); setIsMenuOpen(false); }}
                                className="mt-4 w-full py-2.5 rounded-lg font-bold text-sm"
                                style={{ background: '#b91c1c', color: '#fff' }}
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
                            <h3 className="font-bold text-lg mb-4 text-red-500">About Us</h3>
                            <p className="text-gray-300 text-sm">Leading precast concrete solutions for modern construction.</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-red-500">Quick Links</h3>
                            <ul className="text-gray-300 text-sm space-y-2">
                                <li><Link to="/about" className="hover:text-red-500">About</Link></li>
                                <li><Link to="/services" className="hover:text-red-500">Services</Link></li>
                                <li><Link to="/contact" className="hover:text-red-500">Contact</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-red-500">Contact</h3>
                            <p className="text-gray-300 text-sm">Sugar Mill Road, Near Kuthiala Sayedan, Mandi Bahauddin</p>
                            <p className="text-gray-300 text-sm mt-2">Email: nasir_mirza202@yahoo.com</p>
                            <p className="text-gray-300 text-sm">Mirza Zahid Nasir: +92 345 7579505</p>
                            <p className="text-gray-300 text-sm">Mirza Shoaib: +92 348 7236088</p>
                            <a
                                href="https://wa.me/923457579505"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-red-500 text-sm hover:underline inline-block mt-1"
                            >
                                WhatsApp us anytime
                            </a>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-red-500">Follow Us</h3>
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
