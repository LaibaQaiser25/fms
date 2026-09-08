export default function PageHero({ eyebrow, title, subtitle, image }) {
  return (
    <section
      className="relative text-white py-20 md:py-28 overflow-hidden"
      style={{ background: '#1a1a1a', borderBottom: '4px solid #b91c1c' }}
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
              background: 'linear-gradient(135deg, rgba(20,17,17,0.94) 0%, rgba(20,17,17,0.8) 100%)',
            }}
          />
        </>
      )}

      <div className="relative max-w-7xl mx-auto px-6">
        {eyebrow && (
          <span
            className="inline-block px-4 py-1.5 rounded text-xs font-bold tracking-widest uppercase mb-5"
            style={{ background: '#b91c1c', color: '#fff' }}
          >
            {eyebrow}
          </span>
        )}
        <h1
          className="font-bold mb-4 text-white"
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
