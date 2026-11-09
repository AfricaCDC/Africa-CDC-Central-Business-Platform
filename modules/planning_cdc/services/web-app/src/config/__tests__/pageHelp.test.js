import { describe, it, expect } from 'vitest';
import { ROLES } from '@rbm/lib/roles';
import { helpFor, PAGE_HELP } from '../pageHelp';
import { USER_GUIDES, USER_GUIDES_VERSION } from '../userGuides';

describe('helpFor', () => {
  it('should open the chapter of the focal person guide for a focal person', () => {
    expect(helpFor('/division-reports', [ROLES.FOCAL_PERSON])).toEqual({
      title: 'Focal Person Guide', chapter: 8, url: `/guides/RBM-Focal-Person-Guide.html?v=${USER_GUIDES_VERSION}#ch-8`,
    });
  });

  it('should open the guide of the user\'s role when several guides cover the page', () => {
    expect(helpFor('/division-reports', [ROLES.HEAD_OF_DIVISION]).chapter).toBe(7);
    expect(helpFor('/division-reports', [ROLES.ME_OFFICER]).title).toBe('M&E Guide');
  });

  it('should fall back to the first guide covering the page', () => {
    expect(helpFor('/review-submissions', [ROLES.FOCAL_PERSON]).title).toBe('Responsible Person of the Business Unit Guide');
    expect(helpFor('/my-specifics/new', [ROLES.ME_OFFICER]).chapter).toBe(4);
  });

  it('should prefer a specific path over a general one', () => {
    expect(helpFor('/pirs/mapping', [ROLES.ME_OFFICER]).chapter).toBe(4);
    expect(helpFor('/pirs/41', [ROLES.ME_OFFICER]).chapter).toBe(3);
    expect(helpFor('/my-specifics/12/edit', [ROLES.FOCAL_PERSON]).chapter).toBe(4);
    expect(helpFor('/my-specifics', [ROLES.FOCAL_PERSON]).chapter).toBe(6);
  });

  it('should give nothing on a page no chapter covers', () => {
    expect(helpFor('/user-guides', [ROLES.FOCAL_PERSON])).toBeNull();
    expect(helpFor('/admin/rbac')).toBeNull();
  });

  it('should only name guides that exist', () => {
    const keys = USER_GUIDES.map((g) => g.key);
    PAGE_HELP.forEach((e) => Object.keys(e.chapters).forEach((k) => expect(keys).toContain(k)));
  });
});
