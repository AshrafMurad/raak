import { describe, expect, it } from 'vitest';
import {
  capabilityLocaleHref,
  capabilityTokenFromLocation,
  locationWithoutCapabilityToken,
} from '../lib/capability-token';

describe('capability-token URL handling', () => {
  it('prefers a fragment token so it is not sent in HTTP requests or referrers', () => {
    const url = new URL('https://agency.example/ar/accept-invitation#token=fragment-secret');
    expect(capabilityTokenFromLocation(url)).toBe('fragment-secret');
    expect(locationWithoutCapabilityToken(url)).toBe('/ar/accept-invitation');
    expect(capabilityLocaleHref('/en/accept-invitation', url)).toBe('/en/accept-invitation#token=fragment-secret');
  });

  it('does not consume query tokens and removes them from the visible location', () => {
    const url = new URL('https://agency.example/ar/reset-password?token=query-secret&source=email');
    expect(capabilityTokenFromLocation(url)).toBeUndefined();
    expect(locationWithoutCapabilityToken(url)).toBe('/ar/reset-password?source=email');
  });
});
