import ar from '../messages/ar/design-preview.json';
import en from '../messages/en/design-preview.json';
import type { Locale } from './i18n';

export type PreviewCopy = typeof ar;
export type PreviewTheme = 'light' | 'dark';
export function getPreviewTheme(value: string | string[] | undefined): PreviewTheme {
  return value === 'dark' ? 'dark' : 'light';
}
const dictionaries: Record<Locale, PreviewCopy> = { ar, en };
export function getPreviewCopy(locale: Locale): PreviewCopy {
  return dictionaries[locale];
}

export type PreviewVisitState = 'PLANNED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PreviewFilter = 'all' | 'unassigned' | 'late' | 'requests';
export type PreviewVisit = {
  id: string;
  person: keyof PreviewCopy['people'];
  caregiver: keyof PreviewCopy['caregivers'] | null;
  service: keyof PreviewCopy['services'];
  time: string;
  state: PreviewVisitState;
  late?: boolean;
};

// Synthetic fixtures only. They cannot be passed to a domain mutation.
export const previewVisits: readonly PreviewVisit[] = [
  {
    id: 'VIS-1042',
    person: 'salem',
    caregiver: null,
    service: 'home',
    time: '10:00–11:00',
    state: 'PLANNED',
  },
  {
    id: 'VIS-1038',
    person: 'noura',
    caregiver: 'sara',
    service: 'support',
    time: '09:00–10:00',
    state: 'SCHEDULED',
    late: true,
  },
  {
    id: 'VIS-1044',
    person: 'khalid',
    caregiver: 'reem',
    service: 'home',
    time: '09:30–10:30',
    state: 'IN_PROGRESS',
  },
  {
    id: 'VIS-1036',
    person: 'amal',
    caregiver: 'huda',
    service: 'support',
    time: '08:00–09:00',
    state: 'COMPLETED',
  },
  {
    id: 'VIS-1045',
    person: 'fahad',
    caregiver: 'sara',
    service: 'home',
    time: '11:30–12:30',
    state: 'SCHEDULED',
  },
  {
    id: 'VIS-1046',
    person: 'layla',
    caregiver: null,
    service: 'support',
    time: '14:00–15:00',
    state: 'PLANNED',
  },
];

export function filterPreviewVisits(
  visits: readonly PreviewVisit[],
  query: string,
  state: string,
  copy: PreviewCopy,
) {
  const needle = query.trim().toLocaleLowerCase();
  return visits.filter(
    (visit) =>
      (state === 'all' || visit.state === state) &&
      `${visit.id} ${copy.people[visit.person]} ${copy.services[visit.service]} ${visit.caregiver ? copy.caregivers[visit.caregiver] : copy.unassigned}`
        .toLocaleLowerCase()
        .includes(needle),
  );
}
