import { orange, blue, navy, steel, white, alpha } from '../../homeTheme';

// The skyline that closes the public home page: flat solid blocks, thin lines, a
// pale sun and a tower crane, echoing the page's reference art. Purely decorative
// (aria-hidden), and deliberately flat — crisp edges, no texture.

// [x, width, height, fill] — heights are measured up from the ground line.
const BLOCKS = [
  [24, 104, 92, orange],
  [128, 44, 66, steel],
  [252, 48, 158, navy],
  [300, 42, 104, steel],
  [352, 62, 128, blue],
  [414, 46, 214, orange],
  [458, 74, 118, steel],
  [532, 54, 168, blue],
  [586, 46, 84, navy],
  [634, 92, 46, steel],
  [702, 52, 138, orange],
  [754, 66, 206, blue],
  [820, 44, 108, steel],
  [864, 58, 172, navy],
  [922, 74, 96, orange],
  [996, 50, 150, steel],
  [1046, 86, 216, blue],
  [1132, 48, 122, orange],
  [1180, 70, 164, navy],
  [1250, 88, 64, steel],
  [1338, 84, 132, blue],
  [1422, 40, 78, orange],
];

// Thin dark lines rising above some blocks: [x, top, bottom].
const LINES = [
  [276, 28, 240], [438, 8, 240], [560, 44, 240], [787, 10, 240],
  [893, 36, 240], [1089, 12, 240], [1214, 52, 240], [1380, 70, 240],
];

const GROUND = 240;

// The tower crane, drawn around a mast centred on x=0 that stands on y=0.
function Crane() {
  const rows = Array.from({ length: 10 }, (_, i) => i);
  const jib = Array.from({ length: 12 }, (_, i) => i);
  return (
    <g fill="none" stroke={navy} strokeLinecap="round" strokeLinejoin="round">
      {/* mast: rails, zigzag bracing and ties */}
      <path d="M-7 0V-204M7 0V-204" strokeWidth="2" />
      <g strokeWidth="1.2" opacity="0.9">
        {rows.map((i) => (
          <path key={i} d={i % 2 ? `M7 ${-i * 20}L-7 ${-i * 20 - 20}` : `M-7 ${-i * 20}L7 ${-i * 20 - 20}`} />
        ))}
        {rows.map((i) => <path key={`t${i}`} d={`M-7 ${-i * 20}H7`} />)}
      </g>
      {/* head and pendant cables */}
      <path d="M-7 -204L0 -238L7 -204" strokeWidth="1.6" />
      <path d="M0 -238L118 -204M0 -238L-46 -204" strokeWidth="0.9" opacity="0.85" />
      {/* jib (front) and counter-jib (back) trusses */}
      <path d="M-60 -204H184M-60 -192H7M7 -192L184 -203" strokeWidth="1.8" />
      <g strokeWidth="1">
        {jib.map((i) => {
          const x = 7 + i * 14.7;
          return <path key={i} d={i % 2 ? `M${x} -204L${x + 14.7} -${192 + (i + 1) * 0.93}` : `M${x} -${192 + i * 0.93}L${x + 14.7} -204`} />;
        })}
        {[-60, -46, -32, -18].map((x, i) => <path key={x} d={i % 2 ? `M${x} -192L${x + 14} -204` : `M${x} -204L${x + 14} -192`} />)}
      </g>
      {/* counterweight, cab, trolley */}
      <rect x="-60" y="-192" width="20" height="26" fill={navy} stroke="none" />
      <rect x="9" y="-190" width="16" height="12" fill={navy} stroke="none" />
      <rect x="12" y="-187" width="6" height="5" fill={white} stroke="none" opacity="0.85" />
      <rect x="136" y="-193" width="12" height="6" fill={navy} stroke="none" />
      {/* hoist line, hook block and load */}
      <path d="M142 -187V-92" strokeWidth="0.9" />
      <rect x="132" y="-92" width="20" height="14" fill={orange} stroke="none" />
      <path d="M142 -78V-72" strokeWidth="1.4" />
    </g>
  );
}

// A wide skyline scene that stands on the bottom edge of its container. Size it
// with className/style (it keeps its aspect ratio and crops from the right on
// narrow screens).
export function Skyline({ className = '', style }) {
  return (
    <svg
      viewBox={`0 0 1440 ${GROUND}`}
      preserveAspectRatio="xMinYMax slice"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {/* the sun: a flat pale disc with a thin outline ring, behind the blocks */}
      <circle cx="920" cy="78" r="60" fill={orange} opacity="0.32" />
      <circle cx="920" cy="78" r="64" fill="none" stroke={orange} strokeOpacity="0.32" strokeWidth="1.5" />
      {BLOCKS.map(([x, w, h, fill]) => (
        <rect key={x} x={x} y={GROUND - h} width={w} height={h} fill={fill} />
      ))}
      <g stroke={alpha(navy, 0.4)} strokeWidth="1">
        {LINES.map(([x, top, bottom]) => <path key={x} d={`M${x} ${top}V${bottom}`} />)}
      </g>
      <g transform={`translate(206 ${GROUND})`}>
        <Crane />
      </g>
      {/* a few birds */}
      <g fill="none" stroke={navy} strokeWidth="1.3" strokeLinecap="round" opacity="0.7">
        <path d="M1010 40q4-5 8 0q4-5 8 0M1052 26q3-4 6 0q3-4 6 0M1090 50q3-4 6 0q3-4 6 0" />
      </g>
    </svg>
  );
}
