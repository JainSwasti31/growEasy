'use client';
import { useEffect, useState } from 'react';

export default function Toast({ message, type = 'info', onClose }: { message: string; type?: 'info' | 'success' | 'error'; onClose?: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); onClose?.(); }, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  if (!visible) return null;

  const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-slate-800';

  return (
    <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-2 text-sm text-white ${bg} shadow-lg`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
