/**
 * Run a callback when the Escape key is pressed while the calling component is mounted.
 *
 * @param {() => void} onEscape
 * @returns {void}
 * @example useEscapeKey(onClose);
 */
import { useEffect } from 'react';

export default function useEscapeKey(onEscape) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEscape]);
}
