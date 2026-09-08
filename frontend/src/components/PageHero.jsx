export default function PageHero({ eyebrow, title, subtitle, image }) {
  return (
    <section
      className="relative text-white py-20 md:py-28 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1a6e 35%, #0d4f3c 100%)' }}
    >
      {image && (
        <>
          <img
            src={image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgba(15,12,41,0.92) 0%, rgba(26,26,110,0.85) 40%, rgba(13,79,60,0.9) 100%)',
            }}
          />
        </>
      )}

      {/* decorative glow orb, matches HomePage hero */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            right: '-10%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16,185,129,0.28) 0%, transparent 70%)',
            filter: 'blur(70px)',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        {eyebrow && (
          <span
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-5"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#6ee7b7',
              backdropFilter: 'blur(10px)',
            }}
          >
            {eyebrow}
          </span>
        )}
        <h1
          className="font-bold mb-4"
          style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-lg max-w-xl" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
