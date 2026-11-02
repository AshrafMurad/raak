'use client';
import { useEffect, useState } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { peopleCopy, peopleError } from './copy';
import type { PageResult } from './contracts';

export interface AgencyOffering {
  id: string;
  config: { nameAr: string; nameEn: string };
}
export function useAgencyOfferings(enabled: boolean, locale: Locale) {
  const c = peopleCopy(locale);
  const [items, setItems] = useState<AgencyOffering[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    apiRequest<PageResult<AgencyOffering>>('/agency/services?limit=100')
      .then((data) => {
        if (active) {
          setItems(data.items);
          setCursor(data.nextCursor);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(peopleError(c, e));
      });
    return () => {
      active = false;
    };
  }, [enabled, c]);
  async function loadNext() {
    if (!cursor) return;
    try {
      const data = await apiRequest<PageResult<AgencyOffering>>(
        `/agency/services?limit=100&cursor=${cursor}`,
      );
      setItems((old) => [
        ...old,
        ...data.items.filter((row) => !old.some((item) => item.id === row.id)),
      ]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(peopleError(c, e));
    }
  }
  return { items, cursor, error, loadNext };
}
