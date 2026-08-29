// Simple, print-safe bar charts built in plain HTML/CSS (no chart library —
// react-to-print renders whatever the browser renders, and SVG/canvas add
// nothing here that a few divs don't already do reliably).
//
// Mark spec: bars <=24px thick, 4px rounded at the value end, square at the
// baseline, one flat hue per chart (a magnitude comparison across a few named
// categories, not a ranked/identity series — see dataviz skill,
// choosing-a-form.md: "Compare magnitude -> bar/column -> sequential (one hue)").
const CHART_COLORS = {
  blue: '#2a78d6',
  orange: '#eb6834',
};

const TEXT_SECONDARY = '#52514e';
const BASELINE = '#c3c2b7';

function BarRow({ label, value, max, color, formatValue }) {
  const pct = max > 0 ? (Math.abs(value) / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 text-sm truncate" style={{ color: TEXT_SECONDARY }} title={label}>
        {label}
      </div>
      <div className="flex-1 relative" style={{ height: 22, borderLeft: `1px solid ${BASELINE}` }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${Math.max(pct, value !== 0 ? 1.5 : 0)}%`,
            minWidth: value !== 0 ? 4 : 0,
            background: color,
            borderRadius: '0 4px 4px 0',
          }}
        />
      </div>
      <div
        className="w-28 shrink-0 text-sm font-semibold text-gray-800 text-right"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatValue(value)}
      </div>
    </div>
  );
}

export function BarChartPanel({ title, series, hue = 'blue', formatValue }) {
  const max = Math.max(1, ...series.map((s) => Math.abs(s.value)));
  const color = CHART_COLORS[hue];
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">{title}</h3>
      <div className="flex flex-col gap-2.5">
        {series.map((s) => (
          <BarRow key={s.label} label={s.label} value={s.value} max={max} color={color} formatValue={formatValue} />
        ))}
      </div>
    </div>
  );
}
