/**
 * Notifications = derived alerts from the plan (mandatory work deferred,
 * persistent TSRs, notice shortfalls, blocks awaiting my concurrence or grant,
 * reports to triage) + pushed items from other users' actions (grant,
 * refusal, requisition, incident…). Nothing here is stored twice.
 */
import { useEffect, useMemo, useState } from 'react';
import { generateEventsFromPlan } from '../../engine/eventsFromPlan.js';
import type { Dept } from '../../engine/types';
import { blocksRunningPastEnd, supersededProposals, workflowState, workingBlocks } from '../../engine/select';
import { can, type PortalId } from '../../auth/portals';
import { useAppStore } from '../../store/useAppStore';
import { usePortal } from '../../app/usePortal';
import { hhmm, nowMinuteIST } from '../../lib/format';
import { routeForBlock, routeForReport, routeForTask } from '../palette/CommandPalette';

/** Wall-clock minute (IST), refreshed every minute, for "running past planned end". */
function useMinute(): number {
  const [m, setM] = useState(() => nowMinuteIST());
  useEffect(() => {
    const id = window.setInterval(() => setM(nowMinuteIST()), 60000);
    return () => window.clearInterval(id);
  }, []);
  return m;
}

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

/** A pushed notification carries one route; send each portal to the page it can open. */
function retarget(route: string | undefined, portal: PortalId, canAnyPortal: boolean): string | undefined {
  if (!route) return undefined;
  const q = new URLSearchParams(route.split('?')[1] ?? '');
  if (q.get('block')) return routeForBlock(portal, q.get('block')!);
  if (q.get('task')) return routeForTask(portal, q.get('task')!);
  if (q.get('report')) return routeForReport(portal, q.get('report')!);
  const target = route.split('/')[2];
  if (route.startsWith('/app/') && target !== portal && !canAnyPortal) return undefined;
  return route;
}

function routeForEvent(e: PlanEvent, portal: PortalId): string | undefined {
  if (e.linkType === 'task') {
    if (portal === 'tms' || portal === 'smms' || portal === 'tdms') return `/app/${portal}/register?task=${e.targetId}`;
    return routeForTask(portal, e.targetId ?? '');
  }
  if (e.id.startsWith('EV-ROLLING')) return portal === 'division' ? '/app/division/plans' : portal === 'planning' ? '/app/planning/monthly' : undefined;
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
  const executionLog = useAppStore((s) => s.executionLog);
  const extensions = useAppStore((s) => s.extensions);
  const portal = usePortal();
  const minute = useMinute();

  return useMemo(() => {
    const out: Notification[] = [];
    const isRead = (id: string) => read.includes(id);

    // pushed by other users' actions, addressed to this portal (and department when set)
    for (const p of pushed) {
      if (!p.portals.includes(portal)) continue;
      if (p.dept && user?.dept && p.dept !== user.dept) continue;
      out.push({ id: p.id, at: p.at, type: p.kind, title: p.title, detail: p.body, route: retarget(p.route, portal, user?.role === 'DRM' || user?.role === 'ADMIN'), read: isRead(p.id) });
    }

    if (snapshot) {
      const events = generateEventsFromPlan(snapshot) as PlanEvent[];
      for (const e of events) {
        if (e.type === 'OK' && portal !== 'planning') continue;
        out.push({ id: e.id, type: e.type, title: e.title, detail: e.detail, tag: e.tag, route: routeForEvent(e, portal), read: isRead(e.id) });
      }

      const blocks = workingBlocks(snapshot, approvals);
      const dept = user?.dept as Dept | undefined;
      if (user && dept && can(user, `concur:${dept}` as const)) {
        // only blocks actually sent for concurrence (PROPOSED, partly concurred) — the same list as the department pages
        const waiting = blocks.filter((b) => b.departments.includes(dept) && workflowState(b.approval, b.departments) === 'PROPOSED' && !b.approval?.concur?.[dept]);
        if (waiting.length) {
          const id = `ACT-CONCUR-${dept}-${waiting.length}`;
          out.push({ id, type: 'ACTION', title: `${waiting.length} block${waiting.length > 1 ? 's' : ''} awaiting your concurrence`, detail: waiting.slice(0, 3).map((b) => `${b.id} ${b.dateLabel} ${b.startText}`).join(' · '), tag: 'JPO', route: `/app/${user.portal}/blocks`, read: isRead(id) });
        }
      }
      if (user && can(user, 'grant') && (portal === 'control' || portal === 'division')) {
        const ready = blocks.filter((b) => b.state === 'CONCURRED');
        if (ready.length) {
          const id = `ACT-GRANT-${ready.length}`;
          out.push({ id, type: 'ACTION', title: `${ready.length} block${ready.length > 1 ? 's' : ''} fully concurred — ready to grant`, detail: ready.slice(0, 3).map((b) => `${b.id} ${b.sectionText} ${b.startText}`).join(' · '), tag: 'Grant', route: '/app/control/board', read: isRead(id) });
        }
        // possessions running past their planned (or extended) end — plan day 0 is today, wall-clock minute
        const late = blocksRunningPastEnd(blocks, executionLog.filter((r) => r.corridorId === snapshot.corridor.id), minute, 0);
        if (late.length) {
          const id = `ACT-LATE-${late.map((l) => l.block.id).join('-')}`;
          out.push({ id, type: 'CRITICAL', title: `Running past planned end · ${late.length} possession${late.length > 1 ? 's' : ''}`, detail: late.slice(0, 3).map((l) => `${l.block.sectionText} ${l.block.line} planned to ${hhmm(l.block.end)} (+${l.overMin} min)`).join(' · '), tag: 'Execution', route: routeForBlock(portal, late[0].block.id), read: isRead(id) });
        }
        const pendingExt = extensions.filter((e) => e.status === 'PENDING' && blocks.some((b) => b.id === e.blockId));
        if (pendingExt.length) {
          const id = `ACT-EXT-${pendingExt.map((e) => e.id).join('-')}`;
          out.push({ id, type: 'ACTION', title: `${pendingExt.length} extension request${pendingExt.length > 1 ? 's' : ''} awaiting decision`, detail: pendingExt.slice(0, 3).map((e) => `${e.blockId} +${e.extraMin} min · ${e.reason}`).join(' · '), tag: 'Extension', route: routeForBlock(portal, pendingExt[0].blockId), read: isRead(id) });
        }
      }
      if (user && can(user, 'plan') && portal === 'planning') {
        const changed = supersededProposals(approvals);
        if (changed.length) {
          const id = `ACT-RESEND-${changed.map((c) => c.blockId).join('-')}`;
          out.push({ id, type: 'ACTION', title: `${changed.length} changed proposal${changed.length > 1 ? 's' : ''} to send again`, detail: changed.slice(0, 3).map((c) => c.blockId).join(' · '), tag: 'JPO', route: '/app/planning/handoff', read: isRead(id) });
        }
      }
      if (user && can(user, 'triage')) {
        const pendingReports = reports.filter((r) => r.status === 'UNVERIFIED' && r.corridorId === snapshot.corridor.id && (!dept || r.dept === dept || r.dept === null));
        if (pendingReports.length) {
          const id = `ACT-TRIAGE-${pendingReports.length}`;
          out.push({ id, type: 'ACTION', title: `${pendingReports.length} field / citizen report${pendingReports.length > 1 ? 's' : ''} to triage`, detail: pendingReports.slice(0, 2).map((r) => r.description.slice(0, 60)).join(' · '), tag: 'Intake', route: portal === 'planning' ? '/app/planning/demands' : portal === 'control' ? '/app/control/incidents' : `/app/${portal}/incidents`, read: isRead(id) });
        }
      }
      if (user && can(user, 'plan')) {
        const submitted = requisitions.filter((r) => r.status === 'SUBMITTED' && r.corridorId === snapshot.corridor.id);
        if (submitted.length) {
          const id = `ACT-REQ-${submitted.length}`;
          out.push({ id, type: 'ACTION', title: `${submitted.length} requisition${submitted.length > 1 ? 's' : ''} awaiting validation`, detail: submitted.slice(0, 3).map((r) => `${r.no} ${r.dept}`).join(' · '), tag: 'BDMS', route: '/app/planning/demands', read: isRead(id) });
        }
      }
    }
    const order: Record<NotificationType, number> = { ACTION: 0, CRITICAL: 1, WARNING: 2, INFO: 3, OK: 4 };
    out.sort((a, b) => order[a.type] - order[b.type] || (b.at ?? '').localeCompare(a.at ?? ''));
    return { list: out, unread: out.filter((n) => !n.read).length };
  }, [snapshot, approvals, reports, requisitions, pushed, read, user, portal, executionLog, extensions, minute]);
}
