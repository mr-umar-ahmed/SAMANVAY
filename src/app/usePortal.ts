import { useLocation } from 'react-router-dom';
import { PORTALS, type PortalId } from '../auth/portals';
import type { Dept } from '../engine/types';

/** Portal derived from the URL: /app/<portal>/… or /citizen/…. */
export function usePortal(): PortalId {
  const { pathname } = useLocation();
  if (pathname.startsWith('/citizen')) return 'citizen';
  const seg = pathname.split('/')[2] as PortalId | undefined;
  return seg && seg in PORTALS ? seg : 'planning';
}

/** Department for the departmental portals (tms / smms / tdms), else null. */
export function usePortalDept(): Dept | null {
  const portal = usePortal();
  return PORTALS[portal].dept ?? null;
}
