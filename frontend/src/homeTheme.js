// The public home page's palette, taken from its reference illustration: a white
// ground with vermilion orange and a blue/navy family. Only the home page and
// the components under components/Home read these — the other public pages and
// the logged-in app keep their own colors, and PublicLayout only applies them to
// its navbar/footer when a page passes skin="home".
//
// Pairing rules (WCAG contrast): the illustration's orange is only 3.8:1 on
// white, so it is for fills, graphics and large type. Small orange text uses
// orangeText on light backgrounds and orangeSoft on navy. Body copy is slate,
// headings navy; buttons are navy with white text and only borrow orange for an
// accent chip. Translucent navy/slate text needs >= 0.6 alpha to stay legible.
//
// Tailwind can't interpolate these into class names, so the few arbitrary-value
// classes that mirror them (the "home" classes in PublicLayout's skin) repeat
// the hex — keep those in sync.

export const white = '#FFFFFF';
export const paper = '#F5F7FA';
export const steel = '#90A6BF';
export const blue = '#2A568F';
export const navy = '#1B2A4E';
export const orange = '#DB5A32';
export const orangeText = '#C2401A';
export const orangeSoft = '#F58A5E';
export const slate = '#44536F';

// Condensed all-caps display type (Barlow Condensed, loaded in index.html) — spread
// into a style prop and add fontSize/color at the call site.
export const display = {
  fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  fontWeight: 800,
  textTransform: 'uppercase',
  lineHeight: 0.92,
  letterSpacing: '0.005em',
};

// A translucent tint of a palette color, e.g. alpha(navy, 0.7).
export const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// The hero's look (BIN-ZAHID & PARTNERS), now shared by every public page:
// tones sampled from its reference mockup, and its three typefaces (all loaded
// in index.html).
export const ground = '#FAFAFC';    // page ground behind the hero and page banners
export const ink = '#0B1020';       // the big League Gothic titles
export const serifNavy = '#1A2D4D'; // serif lines, hairlines, drafting lines
export const copy = '#4E586C';      // body copy
export const tagNavy = '#243655';   // "-TAG LINES-"
export const btnNavy = '#0F2555';   // pill buttons
export const btnOrange = '#E0551D'; // the pill's arrow disc, stars, accents
export const gothic = "'League Gothic', 'Arial Narrow', sans-serif"; // use with fontStretch: '75%'
export const serif = "'EB Garamond', 'Cormorant Garamond', serif";
export const sans = "'Montserrat', sans-serif";

// The two display voices, used alternately for headings: condensed League
// Gothic (opened up to 90% width with airy tracking, so words don't read
// cramped) and widely spaced EB Garamond capitals, as in "BIN-ZAHID & PARTNERS".
// Spread into a style prop and add fontSize/color at the call site.
export const gothicType = {
  fontFamily: gothic,
  fontStretch: '90%',
  textTransform: 'uppercase',
  lineHeight: 0.95,
  letterSpacing: '0.09em',
};
export const serifType = {
  fontFamily: serif,
  fontWeight: 500,
  textTransform: 'uppercase',
  lineHeight: 1.1,
  letterSpacing: '0.2em',
};
