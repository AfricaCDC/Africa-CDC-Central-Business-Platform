import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../button';

describe('<Button />', () => {
  it('renders children and defaults to type="button"', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('applies primary variant + sm size classes by default', () => {
    render(<Button>Apply</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-[#1A5632]');
    expect(btn.className).toContain('text-white');
    expect(btn.className).toContain('text-[11px]');
    expect(btn.className).toContain('px-3');
  });

  it('applies secondary variant', () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('border-gray-300');
    expect(btn.className).toContain('text-gray-700');
  });

  it('applies ghost variant', () => {
    render(<Button variant="ghost">Expand all</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-transparent');
    expect(btn.className).toContain('text-gray-600');
  });

  it('applies danger variant', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-red-600');
    expect(btn.className).toContain('border-red-300');
  });

  it('applies inverse variant (translucent white-on-color for banners)', () => {
    render(<Button variant="inverse">New specific</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-white/15');
    expect(btn.className).toContain('text-white');
    expect(btn.className).toContain('border-white/30');
  });

  it('applies size xs (text-[10px] px-2)', () => {
    render(<Button size="xs">x</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('text-[10px]');
    expect(cls).toContain('px-2');
  });

  it('applies size md (text-[11px] px-4 — body-text wider padding)', () => {
    render(<Button size="md">y</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('text-[11px]');
    expect(cls).toContain('px-4');
  });

  it('applies size lg (text-[12px] px-4 — link-text for hero CTAs)', () => {
    render(<Button size="lg">z</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('text-[12px]');
    expect(cls).toContain('px-4');
  });

  it('falls back to primary when variant is unknown', () => {
    render(<Button variant="bogus">Z</Button>);
    expect(screen.getByRole('button').className).toContain('bg-[#1A5632]');
  });

  it('forwards onClick and respects disabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Disabled
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('respects an explicit type="submit"', () => {
    render(<Button type="submit">Go</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('appends caller className without dropping defaults', () => {
    render(<Button className="ml-auto">M</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('ml-auto');
    expect(cls).toContain('bg-[#1A5632]');
  });

  it('forwards refs', () => {
    let ref = null;
    render(<Button ref={(el) => { ref = el; }}>R</Button>);
    expect(ref).toBeInstanceOf(HTMLButtonElement);
  });

  it('NEVER applies rounded corners (CHARTER §4)', () => {
    render(<Button>X</Button>);
    expect(screen.getByRole('button').className).not.toMatch(/\brounded/);
  });

  it('NEVER applies a shadow (CHARTER §4)', () => {
    render(<Button>X</Button>);
    expect(screen.getByRole('button').className).not.toMatch(/\bshadow/);
  });
});
