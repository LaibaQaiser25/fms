// Shared visual constants for the dark panel UI used across the
// sidebar and header — kept here so the two surfaces can't drift apart.
// Colors reference CSS custom properties (see index.css) so they follow
// the active internal-app theme set by context/ThemeContext.jsx.

export const PANEL_STYLE = {
  background: 'var(--panel-bg)',
  border: '1px solid var(--panel-border)',
  boxShadow: 'var(--panel-shadow)',
  backdropFilter: 'var(--panel-blur)',
};

export const ACCENT_GRADIENT_STYLE = {
  background: 'var(--color-brand)',
  boxShadow: 'var(--color-brand-shadow)',
};
