import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'danger' | 'info' | 'success' | 'warning';

interface ToastMessage {
  description?: string;
  id: string;
  title: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (options: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_DURATION_MS = 5000;
const TOAST_EXIT_MS = 300;

function ToastItem({ message, onDismiss }: { message: ToastMessage; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(onDismiss, TOAST_EXIT_MS);
  }, [onDismiss]);

  useEffect(() => {
    timer.current = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => {
      clearTimeout(timer.current);
    };
  }, [dismiss]);

  const iconMap: Record<ToastTone, string> = {
    success: '✓',
    danger: '!',
    warning: '⚠',
    info: 'i',
  };

  return (
    <div
      aria-live="polite"
      className={`toast toast--${message.tone}${exiting ? ' toast--exiting' : ''}`}
      role={message.tone === 'danger' ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="toast__icon">
        {iconMap[message.tone]}
      </span>
      <div className="toast__content">
        <strong className="toast__title">{message.title}</strong>
        {message.description === undefined ? null : (
          <p className="toast__description">{message.description}</p>
        )}
      </div>
      <button
        aria-label="Dismiss notification"
        className="toast__close"
        onClick={dismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback((options: Omit<ToastMessage, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setMessages((current) => [...current.slice(-4), { ...options, id }]);
  }, []);

  const remove = useCallback((id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-label="Notifications" className="toast-container">
        {messages.map((message) => (
          <ToastItem
            key={message.id}
            message={message}
            onDismiss={() => {
              remove(message.id);
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
