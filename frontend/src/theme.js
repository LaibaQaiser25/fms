// Shared visual constants for the dark "glass panel" UI used across the
// sidebar and header — kept here so the two surfaces can't drift apart.

export const PANEL_STYLE = {
  background: 'linear-gradient(135deg, #000000 0%, #05001a 40%, #000d08 100%)',
  border: '1px solid rgba(255,255,255,0.07)',
  boxShadow: '0 8px 40px rgba(0,0,0,0.85), 0 1px 0 rgba(139,92,246,0.3)',
  backdropFilter: 'blur(12px)',
};

export const ACCENT_GRADIENT_STYLE = {
  background: 'linear-gradient(135deg, #581cd4, #059669)',
  boxShadow: '0 0 20px rgba(88,28,212,0.45), 0 0 40px rgba(5,150,105,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
};
