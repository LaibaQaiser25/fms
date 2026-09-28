import { useState } from 'react';

// Minimize state for a form modal (see Minimizable.jsx). `open` is for forms
// whose owner stays mounted while they're closed: closing resets the flag so
// the next open starts expanded.
export const useMinimize = (open = true) => {
  const [minimized, setMinimized] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setMinimized(false);
  }
  return {
    minimized,
    minimize: () => setMinimized(true),
    restore: () => setMinimized(false),
  };
};
