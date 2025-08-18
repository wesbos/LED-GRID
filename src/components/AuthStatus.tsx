import React, { useState, useEffect } from 'react';

const COOKIE_NAME = 'led_grid_admin';

function hasAdminCookie(): boolean {
  if (typeof document === 'undefined') return false;

  return document.cookie
    .split(';')
    .some(cookie => cookie.trim().startsWith(`${COOKIE_NAME}=`));
}

export function AuthStatus() {
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    setIsAuthorized(hasAdminCookie());
  }, []);

  if (isAuthorized) {
    return (
      <div className="auth-status authorized">
        <span>🔓 Admin Access</span>
      </div>
    );
  }

  return (
    <div className="auth-status unauthorized">
      <span>🔒 No Admin Access</span>
    </div>
  );
}
