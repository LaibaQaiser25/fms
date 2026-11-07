import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Goes to the previous page in this tab's history. When there is none (page
// opened directly, from a bookmark or after a refresh on the first page),
// it falls back to the dashboard instead of leaving the app.
export default function BackButton({ fallback = '/dashboard' }) {
  const navigate = useNavigate();
  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
  return (
    <button
      type="button"
      onClick={goBack}
      data-guest-allow
      title="Go back"
      className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      Back
    </button>
  );
}
