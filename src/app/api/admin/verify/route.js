import { NextResponse } from 'next/server';
import { verifyAdminPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { password } = body;

    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ success: false, error: 'Invalid admin passcode' }, { status: 401 });
    }

    return NextResponse.json({ success: true, message: 'Admin access granted' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
