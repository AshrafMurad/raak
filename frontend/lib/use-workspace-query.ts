'use client';

import { useCallback, useSyncExternalStore } from 'react';

const event = 'raak:workspace-query';
function subscribe(notify: () => void) {
  window.addEventListener('popstate', notify);
  window.addEventListener(event, notify);
  return () => {
    window.removeEventListener('popstate', notify);
    window.removeEventListener(event, notify);
  };
}
const snapshot = () => window.location.search;
const serverSnapshot = () => '';

/** Only operational filters, opaque resource IDs and theme belong in this URL. */
export function useWorkspaceQuery() {
  const search = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const update = useCallback((patch: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(patch)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.pushState(window.history.state, '', url);
    window.dispatchEvent(new Event(event));
  }, []);
  return { search, update };
}
