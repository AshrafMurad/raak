import { describe, expect, it } from 'vitest';
import {
  isWorkspaceNavigationItemActive,
  workspaceNavigationItems,
} from '../components/layout/workspace-navigation';

describe('workspace navigation', () => {
  it('provides the same navigation destinations and labels in Arabic and English', () => {
    const arabic = workspaceNavigationItems('ar');
    const english = workspaceNavigationItems('en');

    expect(arabic.map(({ id }) => id)).toEqual(english.map(({ id }) => id));
    expect(arabic.map(({ href }) => href.replace('/ar/', '/{locale}/'))).toEqual(
      english.map(({ href }) => href.replace('/en/', '/{locale}/')),
    );
    expect(arabic.map(({ label }) => label)).not.toEqual(english.map(({ label }) => label));
    expect(arabic.every(({ label }) => label.trim().length > 0)).toBe(true);
    expect(english.every(({ label }) => label.trim().length > 0)).toBe(true);
  });

  it.each(['ar', 'en'] as const)('prefixes every %s destination with its locale', (locale) => {
    expect(
      workspaceNavigationItems(locale).every(({ href }) => href.startsWith(`/${locale}/`)),
    ).toBe(true);
  });

  it('uses unique destinations and keeps request details under the request queue item', () => {
    const items = workspaceNavigationItems('en');
    const hrefs = items.map(({ href }) => href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(
      isWorkspaceNavigationItemActive(
        '/en/workspace/requests/req_synthetic_1',
        '/en/workspace/requests',
      ),
    ).toBe(true);
    expect(
      isWorkspaceNavigationItemActive('/en/workspace/patients', '/en/workspace/requests'),
    ).toBe(false);
  });
});
