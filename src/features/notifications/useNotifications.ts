/**
 * Notifications = derived alerts from the plan (mandatory work deferred,
 * persistent TSRs, notice shortfalls, blocks awaiting my concurrence or grant,
 * reports to triage) + pushed items from other users' actions (grant,
 * refusal, requisition, incident…). Nothing here is stored twice.
 */
import { useMemo } from 'react';
import { generateEventsFromPlan } from '../../engine/eventsFromPlan.js';
import type { Dept } from '../../engine/types';
import { can, type PortalId } from '../../auth/portals';
import { useAppStore } from '../../store/useAppStore';
import { usePortal } from '../../app/usePortal';

export type NotificationType = 'CRITICAL' | 'WARNING' | 'INFO' | 'OK' | 'ACTION';

export interface Notification {
  id: string;
  at?: string;
  type: NotificationType;
  title: string;
  detail: string;
  tag?: string;
  route?: string;
  read: boolean;
}

interface PlanEvent {
  id: string;
  type: 'CRITICAL' | 'WARNING' | 'INFO' | 'OK';
  title: string;
  detail: string;
  time?: string;
  linkType?: string;
  targetId?: string;
  tag?: string;
}

function routeForEvent(e: PlanEvent, portal: PortalId): string | undefined {
  if (e.linkType === 'task') {
    if (portal === 'tms' || portal === 'smms' || portal === 'tdms') return `/app/${portal}/register?task=${e.targetId}`;
    if (portal === 'control') return `/app/control/blocks?task=${e.targetId}`;
    return `/app/planning/risk?task=${e.targetId}`;
  }
  if (e.id.startsWith('EV-ROLLING')) return portal === 'division' ? '/app/division/programme' : '/app/planning/monthly';
  if (e.id.startsWith('EV-COLOC')) return portal === 'planning' ? '/app/planning/weekly' : undefined;
  return undefined;
}

export function useNotifications(): { list: Notification[]; unread: number } {
  const snapshot = useAppStore((s) => s.snapshot);
  const approvals = useAppStore((s) => s.approvals);
  const reports = useAppStore((s) => s.reports);
  const requisitions = useAppStore((s) => s.requisitions);
  const pushed = useAppStore((s) => s.pushed);
  const read = useAppStore((s) => s.readNotifications);
  const user = useAppStore((s) => s.user);
  const portal = usePortal();

  return useMemo(() => {
    const out: Notification[] = [];
    const isRead = (id: string) => read.includes(id);

    // pushed by other users' actions, addressed to this portal (and department when set)
    for (const p of pushed) {
      if (!p.portals.includes(portal)) continue;
      if (p.dept && user?.dept && p.dept !== user.dept) continue;
      out.push({ id: p.id, at: p.at, type: p.kind, title: p.title, detail: p.body, route: p.route, read: isRead(p.id) });
    }

    if (snapshot) {
      const events = generateEventsFromPlan(snapshot) as PlanEvent[];
      for (const e of events) {
        if (e.type === 'OK' && portal !== 'planning') continue;
        out.push({ id: e.id, type: e.type, title: e.title, detail: e.detail, tag: e.tag, route: routeForEvent(e, portal), read: isRead(e.id) });
      }

      const blocks = snapshot.result.weekly.ai.blocks;
      const dept = user?.dept as Dept | undefined;
      if (user && dept && can(user, `concur:${dept}` as const)) {
        const waiting = blocks.filter((b) => b.departments.includes(dept) && !approvals[b.id]?.concur?.[dept] && approvals[b.id]?.status !== 'REFUSED');
        if (waiting.length) {
          const id = `ACT-CONCUR-${dept}-${waiting.length}`;
          out.push({ id, type: 'ACTION', title: `${waiting.length} block${waiting.length > 1 ? 's' : ''} awaiting your concurrence`, detail: waiting.slice(0, 3).map((b) => `${b.id} ${b.dateLabel} ${b.startText}`).join(' · '), tag: 'JPO', route: `/app/${user.portal}/blocks`, read: isRead(id) });
        }
      }
      if (user && can(user, 'grant') && (portal === 'control' || portal === 'division')) {
        const ready = blocks.filter((b) => b.departments.every((d) => approvals[b.id]?.concur?.[d]) && (approvals[b.id]?.status ?? 'PROPOSED') === 'PROPOSED');
        if (ready.length) {
          const id = `ACT-GRANT-${ready.length}`;
          out.push({ id, type: 'ACTION', title: `${ready.length} block${ready.length > 1 ? 's' : ''} fully concurred — ready to grant`, detail: ready.slice(0, 3).map((b) => `${b.id} ${b.sectionText} ${b.startText}`).join(' · '), tag: 'Grant', route: '/app/control/blocks', read: isRead(id) });
        }
      }
      if (user && can(user, 'triage')) {
        const pendingReports = reports.filter((r) => r.status === 'UNVERIFIED' && r.corridorId === snapshot.corridor.id && (!dept || r.dept === dept || r.dept === null));
        if (pendingReports.length) {
          const id = `ACT-TRIAGE-${pendingReports.length}`;
          out.push({ id, type: 'ACTION', title: `${pendingReports.length} field / citizen report${pendingReports.length > 1 ? 's' : ''} to triage`, detail: pendingReports.slice(0, 2).map((r) => r.description.slice(0, 60)).join(' · '), tag: 'Intake', route: portal === 'planning' ? '/app/planning/intake' : portal === 'control' ? '/app/control/incidents' : `/app/${portal}/reports`, read: isRead(id) });
        }
      }
      if (user && can(user, 'plan')) {
        const submitted = requisitions.filter((r) => r.status === 'SUBMITTED' && r.corridorId === snapshot.corridor.id);
        if (submitted.length) {
          const id = `ACT-REQ-${submitted.length}`;
          out.push({ id, type: 'ACTION', title: `${submitted.length} requisition${submitted.length > 1 ? 's' : ''} awaiting validation`, detail: submitted.slice(0, 3).map((r) => `${r.no} ${r.dept}`).join(' · '), tag: 'BDMS', route: '/app/planning/intake', read: isRead(id) });
        }
      }
    }
    const order: Record<NotificationType, number> = { ACTION: 0, CRITICAL: 1, WARNING: 2, INFO: 3, OK: 4 };
    out.sort((a, b) => order[a.type] - order[b.type] || (b.at ?? '').localeCompare(a.at ?? ''));
    return { list: out, unread: out.filter((n) => !n.read).length };
  }, [snapshot, approvals, reports, requisitions, pushed, read, user, portal]);
}
