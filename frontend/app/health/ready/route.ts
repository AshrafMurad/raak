/** Server-only configuration; neither request headers nor browser input selects the API. */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  let apiUp = false;
  const baseUrl = process.env['API_INTERNAL_BASE_URL'];
  if (baseUrl) {
    try {
      const origin = new URL(baseUrl);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
        throw new Error('Invalid internal API URL');
      }
      const response = await fetch(new URL('/v1/health/ready', origin), {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(3_000),
      });
      const body: unknown = response.ok ? await response.json() : null;
      apiUp = Boolean(
        body &&
        typeof body === 'object' &&
        'data' in body &&
        body.data &&
        typeof body.data === 'object' &&
        'status' in body.data &&
        body.data.status === 'ready',
      );
    } catch {
      // Do not expose internal URLs, credentials or upstream error bodies.
      apiUp = false;
    }
  }

  return Response.json(
    {
      data: {
        status: apiUp ? 'ready' : 'not_ready',
        service: 'web',
        components: { api: apiUp ? 'UP' : 'DOWN' },
        time: new Date().toISOString(),
      },
    },
    { status: apiUp ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
