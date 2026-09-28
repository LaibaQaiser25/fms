import { createPortal } from 'react-dom';
import { Minus, Maximize2, X } from 'lucide-react';

// Minimizing a form hides its overlay with the `hidden` class instead of
// unmounting it, so everything typed so far survives until it's restored.
// While minimized, a small bar sits in a shared bottom-right dock (several
// minimized forms stack instead of overlapping). State lives in useMinimize.js.

export const MinimizeButton = ({ onClick, className = 'p-1 hover:bg-gray-100 rounded', iconClassName = 'w-5 h-5 text-gray-600' }) => (
  <button type="button" onClick={onClick} title="Minimize" aria-label="Minimize" className={className}>
    <Minus className={iconClassName} />
  </button>
);

const getDock = () => {
  let dock = document.getElementById('minimized-forms-dock');
  if (!dock) {
    dock = document.createElement('div');
    dock.id = 'minimized-forms-dock';
    dock.className = 'fixed bottom-4 right-4 z-[70] flex flex-col-reverse items-end gap-2';
    document.body.appendChild(dock);
  }
  return dock;
};

export const MinimizedDock = ({ minimized, title, onRestore, onClose }) => {
  if (!minimized) return null;
  return createPortal(
    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-lg pl-3 pr-1 py-1 max-w-[calc(100vw-2rem)]">
      <button
        type="button"
        onClick={onRestore}
        title="Restore"
        className="flex items-center gap-2 min-w-0 text-sm font-semibold text-gray-800 hover:text-[var(--color-accent)] py-1"
      >
        <span className="truncate max-w-[14rem]">{title}</span>
        <Maximize2 className="w-4 h-4 shrink-0" />
      </button>
      {onClose && (
        <button type="button" onClick={onClose} title="Close" aria-label="Close" className="p-1 hover:bg-gray-100 rounded">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      )}
    </div>,
    getDock()
  );
};
