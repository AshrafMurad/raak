export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'ApiRequestError';
  }
}

type RealmTarget = 'current' | 'platform';

function apiUrl(path: string, realm: RealmTarget): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  if (base === '') return `/v1${path}`;
  const url = new URL(base);
  if (typeof window !== 'undefined') {
    const current = window.location.hostname;
    if (realm === 'platform') {
      if (current === 'localhost' || current.endsWith('.localhost')) {
        url.hostname = 'platform.localhost';
      }
    } else if (current !== 'localhost') {
      // Tenant login must reach the matching API host; ports do not affect the
      // host-only cookie boundary.
      url.hostname = current;
    }
  }
  url.pathname = `/v1${path}`;
  url.search = '';
  return url.toString();
}

function csrfCookie(realm: RealmTarget): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const name = realm === 'platform' ? 'raak_csrf_platform' : 'raak_csrf_agency';
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  realm: RealmTarget = 'current',
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = csrfCookie(realm);
    if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf));
  }
  const response = await fetch(apiUrl(path, realm), {
    ...init,
    headers,
    credentials: 'include',
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string };
  };
  if (!response.ok || body.data === undefined) {
    throw new ApiRequestError(response.status, body.error?.code ?? 'REQUEST_FAILED');
  }
  return body.data;
}
