import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/rbac';
import { getAuditLogs } from '@/lib/auth/audit';

export async function GET(request) {
  const auth = await requireAuth(request, { minGlobalRole: 'GLOBAL_ADMIN' });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const action = searchParams.get('action') || undefined;
    const actorUsername = searchParams.get('actorUsername') || undefined;
    const status = searchParams.get('status') || undefined;
    const targetResource = searchParams.get('targetResource') || undefined;

    const result = await getAuditLogs({
      limit,
      offset,
      action,
      actorUsername,
      status,
      targetResource
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
