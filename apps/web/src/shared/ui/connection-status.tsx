import { useEffect, useState } from 'react';
export function ConnectionStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online ? null : (
    <div className="connection-status" role="status">
      You’re offline. Keep this page open to preserve entered work. Reconnect before saving or
      uploading.
    </div>
  );
}
