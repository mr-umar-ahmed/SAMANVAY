import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PORTALS, type PortalId } from '../auth/portals';
import { useAppStore } from '../store/useAppStore';

const PORTAL_IDS = new Set(Object.keys(PORTALS));

/**
 * Guards /app/:portal/*. A user may open their own portal; DRM and admins may
 * open any portal (read + authorise). Everyone else is sent to their landing.
 */
export function RequireAuth() {
  const user = useAppStore((s) => s.user);
  const loc = useLocation();
  const portal = loc.pathname.split('/')[2];
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!portal || !PORTAL_IDS.has(portal)) return <Navigate to={PORTALS[user.portal].landing} replace />;
  const target = portal as PortalId;
  const allowed = target === user.portal || user.role === 'DRM' || user.role === 'ADMIN';
  if (!allowed) return <Navigate to={PORTALS[user.portal].landing} replace />;
  return <Outlet />;
}
