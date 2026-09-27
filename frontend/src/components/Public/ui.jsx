import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ink, tagNavy, btnNavy, btnOrange, sans, gothicType, serifType } from '../../homeTheme';

// Small building blocks for the public pages, in the home hero's look:
// "-TAG-" lines, League Gothic titles, Montserrat copy, navy pill buttons.

// The widely tracked "-PRECAST SOLUTIONS-" style label.
export function Tag({ children, className = '', color = tagNavy }) {
  return (
    <p className={`text-[0.8rem] font-extrabold uppercase ${className}`}
      style={{ fontFamily: sans, color, letterSpacing: '0.45em' }}>
      -{children}-
    </p>
  );
}

// A display title in either voice: `font="gothic"` (condensed League Gothic,
// the default) or `font="serif"` (spaced EB Garamond capitals, set smaller since
// they run much wider). `as` picks the heading level.
export function Title({ as = 'h2', font = 'gothic', children, className = '', size, color = ink, style }) {
  const Heading = as;
  const type = font === 'serif'
    ? { ...serifType, fontSize: size ?? 'clamp(1.75rem, 3.4vw, 2.6rem)' }
    : { ...gothicType, fontSize: size ?? 'clamp(2.5rem, 5vw, 3.75rem)' };
  return (
    <Heading className={className} style={{ ...type, color, ...style }}>
      {children}
    </Heading>
  );
}

// Tag over a title, left-aligned or centred.
export function SectionTitle({ tag, title, font, center = false, className = '' }) {
  return (
    <header className={`${center ? 'text-center' : ''} ${className}`}>
      {tag && <Tag className="mb-4">{tag}</Tag>}
      <Title font={font}>{title}</Title>
    </header>
  );
}

// The navy pill with the orange arrow disc. Renders a Link with `to`,
// otherwise a button (pass type/onClick/disabled through).
export function PillButton({ to, children, icon = ArrowRight, className = '', ...rest }) {
  const Icon = icon;
  const cls = `group inline-flex items-center justify-between gap-4 rounded-full py-2 pl-6 pr-2 sm:gap-6 sm:pl-8 transition hover:opacity-95 disabled:opacity-60 ${className}`;
  const inner = (
    <>
      <span className="whitespace-nowrap text-[13px] font-bold uppercase tracking-[0.12em] sm:text-[15px] sm:tracking-[0.16em]" style={{ fontFamily: sans }}>{children}</span>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5"
        style={{ background: btnOrange }}>
        <Icon size={20} />
      </span>
    </>
  );
  const style = { background: btnNavy, color: '#fff' };
  return to
    ? <Link to={to} className={cls} style={style}>{inner}</Link>
    : <button className={cls} style={style} {...rest}>{inner}</button>;
}
