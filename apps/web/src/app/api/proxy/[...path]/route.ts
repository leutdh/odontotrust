import { NextResponse, type NextRequest } from 'next/server';
import { apiFetch, getContext } from '@/lib/api';

// Server-side proxy: reads the session from the httpOnly cookie and forwards the request to
// the API with `Authorization: Bearer <jwt>` and `X-Clinica-Id`. The browser never sees the JWT.
async function handle(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  // Fixed /api/v1 prefix + encoded segments: the proxy cannot be pointed at other hosts or paths.
  if (path.some((s) => s === '..' || s === '.' || s === '')) {
    return NextResponse.json({ code: 'bad_request', message: 'Invalid path' }, { status: 400 });
  }
  const target = `/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;

  const context = await getContext();
  if (!context) return NextResponse.json({ code: 'unauthorized', message: 'Authentication required' }, { status: 401 });

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const res = await apiFetch(
    target,
    {
      method: request.method,
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
      body: hasBody ? await request.text() : undefined,
    },
    context.clinicaId ?? undefined,
  );
  if (!res) return NextResponse.json({ code: 'unauthorized', message: 'Authentication required' }, { status: 401 });

  return new NextResponse(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
