import { useEffect, useState } from 'react';

/**
 * The value once it has not changed for `delay` ms (a typing pause).
 *
 * @param {*} value
 * @param {number} delay - ms
 * @returns {*}
 * @example const term = useDebouncedValue(query, 250);
 */
export function useDebouncedValue(value, delay) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
