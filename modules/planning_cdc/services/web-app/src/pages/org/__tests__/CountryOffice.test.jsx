// ── Country office badge and picker (D-20261026-05) ──

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CountryOfficeBadge, CountryOfficePicker, CountryOfficeFields } from '../CountryOffice';

describe('<CountryOfficeBadge />', () => {
  it('should name the country of a country office', () => {
    render(<CountryOfficeBadge unit={{ is_country_office: 1, country_code: 'KEN' }} />);
    expect(screen.getByText('Country office · Kenya')).toBeInTheDocument();
  });

  it('should render nothing for a unit that is not a country office', () => {
    const { container } = render(<CountryOfficeBadge unit={{ is_country_office: 0, country_code: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('<CountryOfficePicker />', () => {
  it('should send the country when one is picked', () => {
    const onChange = vi.fn();
    render(<CountryOfficePicker unit={{ is_country_office: 0 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Kenya'));
    expect(onChange).toHaveBeenCalledWith({ is_country_office: true, country_code: 'KEN' });
  });

  it('should clear the country when « Not a country office » is picked', () => {
    const onChange = vi.fn();
    render(<CountryOfficePicker unit={{ is_country_office: 1, country_code: 'KEN' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Not a country office'));
    expect(onChange).toHaveBeenCalledWith({ is_country_office: false, country_code: null });
  });
});

describe('<CountryOfficeFields /> (D-20261028-01)', () => {
  it('should show the generated name and code once a country is picked', () => {
    render(<CountryOfficeFields isCountryOffice onToggle={vi.fn()} country="COD" onCountry={vi.fn()} />);
    expect(screen.getByText('Congo (Democratic Republic) Country Office')).toBeInTheDocument();
    expect(screen.getByText('(COD-CO)')).toBeInTheDocument();
  });

  it('should hide the country picker until « Country office » is ticked', () => {
    const onToggle = vi.fn();
    render(<CountryOfficeFields isCountryOffice={false} onToggle={onToggle} country="" onCountry={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Country office' }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
