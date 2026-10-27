export function capabilityTokenFromLocation(url: URL): string | undefined {
  return new URLSearchParams(url.hash.slice(1)).get('token') ?? undefined;
}

export function locationWithoutCapabilityToken(url: URL): string {
  const clean = new URL(url);
  clean.searchParams.delete('token');
  clean.hash = '';
  return `${clean.pathname}${clean.search}`;
}

export function capabilityLocaleHref(path: string, url: URL): string {
  return capabilityTokenFromLocation(url) ? `${path}${url.hash}` : path;
}
