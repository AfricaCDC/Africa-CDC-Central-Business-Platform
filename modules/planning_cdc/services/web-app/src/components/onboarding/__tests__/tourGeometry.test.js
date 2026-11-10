import { describe, it, expect, afterEach } from 'vitest';
import { anchorRect, popoverPosition } from '../tourGeometry';

const VIEW = { width: 1200, height: 800 };

afterEach(() => { document.body.innerHTML = ''; });

describe('anchorRect', () => {
  it('should return null when no element carries the key', () => {
    expect(anchorRect('avatar')).toBeNull();
    expect(anchorRect(undefined)).toBeNull();
  });

  it('should return null for a hidden element (empty box)', () => {
    document.body.innerHTML = '<div data-tour="avatar"></div>';
    expect(anchorRect('avatar')).toBeNull();
  });

  it('should return the box of a visible element', () => {
    document.body.innerHTML = '<div data-tour="avatar"></div>';
    document.querySelector('div').getBoundingClientRect = () => ({ top: 10, left: 20, width: 36, height: 36 });
    expect(anchorRect('avatar')).toEqual({ top: 10, left: 20, width: 36, height: 36 });
  });
});

describe('popoverPosition', () => {
  it('should centre the card when there is no anchor', () => {
    expect(popoverPosition(null, VIEW)).toBeNull();
  });

  it('should place the card under an anchor at the top of the screen', () => {
    expect(popoverPosition({ top: 10, left: 100, width: 80, height: 40 }, VIEW)).toEqual({ top: 62, left: 100, width: 320, above: false });
  });

  it('should place the card above an anchor near the bottom', () => {
    const pos = popoverPosition({ top: 700, left: 100, width: 80, height: 40 }, VIEW);
    expect(pos).toEqual({ top: 688, left: 100, width: 320, above: true });
  });

  it('should keep the card inside the screen for an anchor at the right edge', () => {
    expect(popoverPosition({ top: 10, left: 1180, width: 20, height: 40 }, VIEW).left).toBe(1200 - 320 - 16);
  });

  it('should shrink the card on a narrow screen', () => {
    expect(popoverPosition({ top: 10, left: 0, width: 20, height: 40 }, { width: 300, height: 800 })).toMatchObject({ width: 268, left: 16 });
  });
});
