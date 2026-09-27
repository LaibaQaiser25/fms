import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import LoginModal from '../components/Login';
import { white, navy, blue, orangeText, alpha } from '../homeTheme';

// Every public page shares this navbar + footer. "default" is the original
// charcoal/red look; a page opts into another skin via the `skin` prop so
// re-theming one page doesn't leak onto the rest. Navbar slots are inline-style
// values; page/footer slots are Tailwind class strings, kept as full literals
// so the class scanner emits them — which is why the "home" ones repeat the
// palette hex from homeTheme.js instead of interpolating it.
const SKINS = {
    default: {
        page: 'bg-white',
        navBg: '#1a1a1a',
        navBorder: '3px solid #b91c1c',
        navShadow: '0 2px 10px rgba(0,0,0,0.5)',
        navDesktop: 'hidden md:flex',
        navLogin: 'hidden md:block',
        navToggle: 'md:hidden',
        navMenu: 'md:hidden',
        logoRule: '#b91c1c',
        brand: '#fff',
        brandName: 'Bin-Zahid & Partners',
        tagline: '#ef4444',
        link: 'rgba(255,255,255,0.65)',
        linkActive: '#ef4444',
        menuLink: 'rgba(255,255,255,0.6)',
        menuRule: 'rgba(255,255,255,0.1)',
        toggle: 'rgba(255,255,255,0.7)',
        btnBg: '#b91c1c',
        btnText: '#fff',
        btnBorder: undefined,
        btnShadow: '0 2px 10px rgba(0,0,0,0.35)',
        btnPad: 'py-2.5',
        footer: 'bg-gray-900 text-white',
        footHead: 'text-[#ef4444]',
        footText: 'text-gray-300',
        footHover: 'hover:text-[#ef4444]',
        footRule: 'border-gray-700',
        footMuted: 'text-gray-400',
    },
    home: {
        page: 'bg-white',
        navBg: white,
        navBorder: `1px solid ${alpha(navy, 0.1)}`,
        navShadow: `0 12px 30px -20px ${alpha(navy, 0.4)}`,
        // this skin's roomier brand + links only fit side by side from lg up
        navDesktop: 'hidden lg:flex',
        navLogin: 'hidden lg:block',
        navToggle: 'lg:hidden',
        navMenu: 'lg:hidden',
        logoRule: blue,
        brand: navy,
        brandName: 'Ittefaq Builders',
        tagline: orangeText,
        link: alpha(navy, 0.72),
        linkActive: orangeText,
        menuLink: alpha(navy, 0.72),
        menuRule: alpha(navy, 0.12),
        toggle: navy,
        // hollow, so it doesn't compete with the hero's primary CTA; the 2px
        // border comes out of the vertical padding to keep the 40px height
        btnBg: 'transparent',
        btnText: navy,
        btnBorder: `2px solid ${navy}`,
        btnShadow: 'none',
        btnPad: 'py-2',
        footer: 'bg-[#1B2A4E] text-white border-t-[3px] border-[#DB5A32]',
        footHead: 'text-[#F58A5E]',
        footText: 'text-white/75',
        footHover: 'hover:text-[#F58A5E]',
        footRule: 'border-white/15',
        footMuted: 'text-white/60',
    },
};

export default function PublicLayout({ children, skin = 'default' }) {
    const s = SKINS[skin] ?? SKINS.default;
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
        <div className={`min-h-screen ${s.page} flex flex-col`}>
            {/* Navbar */}
            <nav className="sticky top-0 z-50" style={{
                background: s.navBg,
                borderBottom: s.navBorder,
                boxShadow: s.navShadow,
                transform: navHidden ? 'translateY(-100%)' : 'translateY(0)',
                transition: 'transform 0.3s ease',
            }}>
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex justify-between items-center">

                        {/* Logo */}
                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden"
                                style={{ border: `1px solid ${s.logoRule}` }}>
                                <img src="../logo.jpeg" alt="Bin-Zahid Logo" className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <div className="font-bold text-lg leading-tight"
                                    style={{
                                        color: s.brand,
                                        fontFamily: "'Cormorant Garamond', serif",
                                        fontSize: '1.4rem',
                                        fontWeight: '700',
                                        letterSpacing: '0.12em',
                                        textTransform: 'uppercase',
                                    }}>
                                    {s.brandName}
                                </div>
                                <div className="text-xs"
                                style={{
                                    fontFamily: "'Cormorant Garamond', serif",
                                    letterSpacing: '0.2em',
                                    textTransform: 'uppercase',
                                    color: s.tagline,
                                }}>
                                    Precast Solutions
                                </div>
                            </div>
                        </Link>

                        {/* Desktop Nav */}
                        <div className={`${s.navDesktop} items-center gap-7`}>
                            {navItems.map(item => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className="text-sm font-medium transition-all duration-200"
                                    style={{
                                        color: isActive(item.path) ? s.linkActive : s.link,
                                        borderBottom: isActive(item.path) ? `2px solid ${s.linkActive}` : '2px solid transparent',
                                        paddingBottom: '2px',
                                    }}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </div>

                        {/* Right Side */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsLoginOpen(true)}
                                className={`${s.navLogin} text-sm font-bold px-6 ${s.btnPad} rounded-lg transition hover:opacity-90`}
                                style={{
                                    background: s.btnBg,
                                    color: s.btnText,
                                    border: s.btnBorder,
                                    boxShadow: s.btnShadow,
                                }}
                            >
                                Login
                            </button>
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className={`${s.navToggle} p-2`}
                                style={{ color: s.toggle }}
                            >
                                {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
                            </button>
                        </div>
                    </div>

                    {/* Mobile Menu */}
                    {isMenuOpen && (
                        <div className={`${s.navMenu} mt-4 pb-4`}
                            style={{ borderTop: `1px solid ${s.menuRule}` }}>
                            {navItems.map(item => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setIsMenuOpen(false)}
                                    className="block py-2.5 text-sm font-medium transition-all"
                                    style={{ color: isActive(item.path) ? s.linkActive : s.menuLink }}
                                >
                                    {item.label}
                                </Link>
                            ))}
                            <button
                                onClick={() => { setIsLoginOpen(true); setIsMenuOpen(false); }}
                                className={`mt-4 w-full ${s.btnPad} rounded-lg font-bold text-sm`}
                                style={{ background: s.btnBg, color: s.btnText, border: s.btnBorder }}
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
            <footer className={`${s.footer} py-12`}>
                <div className="max-w-7xl mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                        <div>
                            <h3 className={`font-bold text-lg mb-4 ${s.footHead}`}>About Us</h3>
                            <p className={`${s.footText} text-sm`}>Leading precast concrete solutions for modern construction.</p>
                        </div>
                        <div>
                            <h3 className={`font-bold text-lg mb-4 ${s.footHead}`}>Quick Links</h3>
                            <ul className={`${s.footText} text-sm space-y-2`}>
                                <li><Link to="/about" className={s.footHover}>About</Link></li>
                                <li><Link to="/services" className={s.footHover}>Services</Link></li>
                                <li><Link to="/contact" className={s.footHover}>Contact</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h3 className={`font-bold text-lg mb-4 ${s.footHead}`}>Contact</h3>
                            <p className={`${s.footText} text-sm`}>Sugar Mill Road, Near Kuthiala Sayedan, Mandi Bahauddin</p>
                            <p className={`${s.footText} text-sm mt-2`}>Email: nasir_mirza202@yahoo.com</p>
                            <p className={`${s.footText} text-sm`}>Mirza Zahid Nasir: +92 345 7579505</p>
                            <p className={`${s.footText} text-sm`}>Mirza Shoaib: +92 348 7236088</p>
                            <a
                                href="https://wa.me/923457579505"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${s.footHead} text-sm hover:underline inline-block mt-1`}
                            >
                                WhatsApp us anytime
                            </a>
                        </div>
                        <div>
                            <h3 className={`font-bold text-lg mb-4 ${s.footHead}`}>Follow Us</h3>
                            <p className={`${s.footText} text-sm`}>Facebook: اتفاق بلڈرز کی تیار چھتیں اور دیواریں منڈی بہاؤالدین</p>
                        </div>
                    </div>
                    <div className={`border-t ${s.footRule} pt-8 text-center ${s.footMuted} text-sm`}>
                        <p>&copy; 2024 Bin-Zahid & Partners. All rights reserved.</p>
                    </div>
                </div>
            </footer>

            {/* Login Modal */}
            <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
        </div>
    );
}
