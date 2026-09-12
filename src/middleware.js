import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const ACCESS_SECRET = process.env.AUTH_ACCESS_SECRET || 'fallback-secret-key-at-least-32-chars-long-grepolis-auth-2026';
const encodedSecret = new TextEncoder().encode(ACCESS_SECRET);

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('grepo_access')?.value;

  let session = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, encodedSecret, { algorithms: ['HS256'] });
      session = payload;
    } catch {
      session = null;
    }
  }

  const isGlobalAdmin = session?.globalRole === 'GLOBAL_ADMIN';
  const teams = Array.isArray(session?.teams) ? session.teams : [];
  const hasVerifiedTeam = isGlobalAdmin || teams.some(t => t.status === 'VERIFIED');

  // 1. Already authenticated user visiting /login
  if (pathname === '/login') {
    if (session) {
      if (!hasVerifiedTeam && !isGlobalAdmin) {
        return NextResponse.redirect(new URL('/verify', request.url));
      }
      return NextResponse.redirect(new URL('/map', request.url));
    }
    return NextResponse.next();
  }

  // 2. Admin routes: require GLOBAL_ADMIN
  if (pathname.startsWith('/admin')) {
    if (!session) {
      return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(pathname)}`, request.url));
    }
    if (!isGlobalAdmin) {
      return NextResponse.redirect(new URL('/map', request.url));
    }
    return NextResponse.next();
  }

  // 3. Tactical routes: /map, /snipe, /stats, /reports, /planner, /team
  const isTactical = ['/map', '/snipe', '/stats', '/reports', '/planner', '/team'].some(p => pathname.startsWith(p));
  if (isTactical) {
    if (!session) {
      return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(pathname)}`, request.url));
    }
    if (!hasVerifiedTeam) {
      return NextResponse.redirect(new URL('/verify', request.url));
    }
    return NextResponse.next();
  }

  // 4. Verify page: if already verified, redirect to /map
  if (pathname.startsWith('/verify')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (hasVerifiedTeam) {
      return NextResponse.redirect(new URL('/map', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/map/:path*',
    '/snipe/:path*',
    '/stats/:path*',
    '/reports/:path*',
    '/planner/:path*',
    '/team/:path*',
    '/verify/:path*',
    '/login'
  ]
};
