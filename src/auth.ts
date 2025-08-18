// SERVER-SIDE ONLY: Authentication for admin functions
const AUTH_CONFIG = {
  COOKIE_NAME: 'led_grid_admin',
  ADMIN_SECRET: process.env.ADMIN_SECRET,
} as const;

export function isAdminAuthorized(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return false;

  const cookies = parseCookies(cookieHeader);
  const adminCookie = cookies[AUTH_CONFIG.COOKIE_NAME];

  return adminCookie === AUTH_CONFIG.ADMIN_SECRET;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[decodeURIComponent(name)] = decodeURIComponent(value);
    }
  });

  return cookies;
}

export function createUnauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message: 'Admin access required'
    }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
