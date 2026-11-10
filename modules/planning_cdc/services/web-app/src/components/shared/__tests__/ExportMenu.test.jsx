// ── ExportMenu tests ──
//
// The menu must open on click, expose XLSX + CSV options, call onExport with
// the chosen format, close after picking, and be disabled while exporting.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportMenu from '../ExportMenu';

describe('<ExportMenu />', () => {
  let onExport;
  beforeEach(() => { onExport = vi.fn(); });

  it('should render an Export button and hide the menu initially', () => {
    render(<ExportMenu onExport={onExport} />);
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should open the menu with Excel and CSV options on click', () => {
    render(<ExportMenu onExport={onExport} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /excel/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /csv/i })).toBeInTheDocument();
  });

  it('should call onExport with the chosen format and close the menu', () => {
    render(<ExportMenu onExport={onExport} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /excel/i }));
    expect(onExport).toHaveBeenCalledWith('xlsx');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should export CSV when the CSV option is chosen', () => {
    render(<ExportMenu onExport={onExport} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /csv/i }));
    expect(onExport).toHaveBeenCalledWith('csv');
  });

  it('should be disabled and show no menu while exporting', () => {
    render(<ExportMenu onExport={onExport} isExporting />);
    const btn = screen.getByRole('button', { name: /export/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should be disabled when disabled prop is set', () => {
    render(<ExportMenu onExport={onExport} disabled />);
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });
});
