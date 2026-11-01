import { describe, expect, it } from 'vitest';
import {
  filterPreviewVisits,
  getPreviewCopy,
  getPreviewTheme,
  previewVisits,
} from '../lib/design-preview';

describe('preview theme query', () => {
  it('allows an explicit dark preview and otherwise preserves the light-first default', () => {
    expect(getPreviewTheme('dark')).toBe('dark');
    for (const value of [undefined, 'light', 'invalid', ['dark', 'light']]) {
      expect(getPreviewTheme(value)).toBe('light');
    }
  });
});

describe('synthetic workspace filtering', () => {
  it('searches localized people and caregiver labels without losing the state filter', () => {
    const ar = getPreviewCopy('ar');
    expect(
      filterPreviewVisits(previewVisits, ar.caregivers.sara, 'all', ar).map((visit) => visit.id),
    ).toEqual(['VIS-1038', 'VIS-1045']);
    expect(filterPreviewVisits(previewVisits, ar.caregivers.sara, 'PLANNED', ar)).toEqual([]);
    const en = getPreviewCopy('en');
    expect(
      filterPreviewVisits(previewVisits, '  SALEM  ', 'PLANNED', en).map((visit) => visit.id),
    ).toEqual(['VIS-1042']);
  });

  it('finds references regardless of case and represents cancelled as an empty view', () => {
    const copy = getPreviewCopy('en');
    expect(filterPreviewVisits(previewVisits, 'vis-1042', 'all', copy)).toHaveLength(1);
    expect(filterPreviewVisits(previewVisits, '', 'CANCELLED', copy)).toEqual([]);
    expect(filterPreviewVisits(previewVisits, 'no such fixture', 'all', copy)).toEqual([]);
  });

  it('keeps late alerts separate from visit state and planned fixtures unassigned', () => {
    expect(
      previewVisits.filter((visit) => visit.late).every((visit) => visit.state === 'SCHEDULED'),
    ).toBe(true);
    expect(
      previewVisits
        .filter((visit) => visit.state === 'PLANNED')
        .every((visit) => visit.caregiver === null),
    ).toBe(true);
  });
});
