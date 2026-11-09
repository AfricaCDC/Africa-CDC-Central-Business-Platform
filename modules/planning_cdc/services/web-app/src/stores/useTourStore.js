import { create } from 'zustand';

/**
 * Which tour is open and on which step, shared by the tour overlay and the
 * « Take the tour » entry of the menu under the initials (D-20261105-16).
 * UI state only; the step survives a page change.
 *
 * @example useTourStore.getState().start('full');
 */
export const useTourStore = create((set) => ({
  mode: null, // 'full' | 'new' | null
  index: 0,
  autoChecked: false, // the automatic start is tried once per page load
  start: (mode) => set({ mode, index: 0 }),
  go: (index) => set({ index }),
  stop: () => set({ mode: null, index: 0 }),
  markAutoChecked: () => set({ autoChecked: true }),
}));
