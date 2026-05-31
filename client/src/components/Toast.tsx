interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export default function Toast({ toasts, onRemove }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" role="alert">
          <span className={`toast-icon ${toast.type}`} aria-hidden="true" />
          <span className="toast-message">{toast.message}</span>
          <button
            className="btn-xs btn-ghost"
            onClick={() => onRemove(toast.id)}
            aria-label="Dismiss notification"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
