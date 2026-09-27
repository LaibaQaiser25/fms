import { alpha, ink, serifNavy, copy, tagNavy, sans } from '../../homeTheme';

// Shared style values for the public pages (see ui.jsx for the components).

// Flat card: white, hairline border, no shadow.
export const card = { background: '#fff', border: `1px solid ${alpha(serifNavy, 0.12)}` };

// Form field + label styling.
export const fieldClass = 'w-full rounded-xl px-4 py-3 text-[15px] outline-none transition focus:border-[#0F2555] focus:ring-2 focus:ring-[#0F2555]/15';
export const fieldStyle = { fontFamily: sans, color: ink, background: '#fff', border: `1px solid ${alpha(serifNavy, 0.2)}` };
export const labelClass = 'mb-2 block text-xs font-bold uppercase tracking-[0.16em]';
export const labelStyle = { fontFamily: sans, color: tagNavy };

// Body copy.
export const bodyStyle = { fontFamily: sans, color: copy };
