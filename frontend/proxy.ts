import { NextResponse, type NextRequest } from 'next/server';

/**
 * Locale redirect (ADR-0005): Arabic-first. `/` and any path missing an `ar`/`en`
 * prefix redirect to the same path under `/ar`. Tenant hostname resolution is a
 * Sprint 1 concern and deliberately absent here.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/health/live' || pathname === '/health/ready') {
    return NextResponse.next();
  }
  if (
    pathname === '/ar' ||
    pathname.startsWith('/ar/') ||
    pathname === '/en' ||
    pathname.startsWith('/en/')
  ) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = `/ar${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|favicon\\.ico).*)'],
};
