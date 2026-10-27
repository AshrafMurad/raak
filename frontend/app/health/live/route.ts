export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(
    {
      data: { status: 'ok', service: 'web', time: new Date().toISOString() },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
