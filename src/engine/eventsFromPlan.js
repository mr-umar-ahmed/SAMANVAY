/**
 * SAMANVAY operational event generator.
 * Derives actionable notifications, alerts and audit triggers from plan snapshots.
 * Pure isomorphic ES module.
 */

export function generateEventsFromPlan(snapshot) {
  if (!snapshot || !snapshot.result) return [];
  const events = [];
  const weekly = snapshot.result.weekly;
  const kpis = weekly?.kpis;
  const tasks = snapshot.tasks || [];
  const scheduledIds = new Set((weekly?.ai?.scheduled || []).map((s) => s.taskId));

  // 1. Mandatory safety tasks deferred or approaching due date
  for (const t of tasks) {
    if (t.risk && t.risk.mandatory) {
      if (!scheduledIds.has(t.id)) {
        events.push({
          id: `EV-MAND-DEF-${t.id}`,
          type: 'CRITICAL',
          title: `Mandatory Safety Task Deferred: ${t.id}`,
          detail: `${t.label} on ${t.sectionLabel} (${t.line}) could not be fitted in weekly window. Immediate controller concurrence required.`,
          time: 'Active',
          linkType: 'task',
          targetId: t.id,
          tag: 'Safety'
        });
      } else if (t.daysOverdue > 0) {
        events.push({
          id: `EV-MAND-OD-${t.id}`,
          type: 'WARNING',
          title: `Statutory Overdue Work Scheduled: ${t.id}`,
          detail: `${t.label} is ${t.daysOverdue} days overdue; prioritized for clearance in weekly plan.`,
          time: 'Active',
          linkType: 'task',
          targetId: t.id,
          tag: 'P-Way'
        });
      }
    }
  }

  // 2. High persistence TSRs (>7 days in force)
  for (const t of tasks) {
    if (t.tsrKmph && (t.tsrSinceDays || 0) >= 7) {
      events.push({
        id: `EV-TSR-${t.id}`,
        type: 'WARNING',
        title: `Persistent TSR (${t.tsrKmph} km/h) on ${t.sectionLabel}`,
        detail: `Speed restriction has been in force for ${t.tsrSinceDays} days, causing daily speed loss.`,
        time: 'TSR Active',
        linkType: 'task',
        targetId: t.id,
        tag: 'Speed'
      });
    }
  }

  // 3. Co-location achievement notification
  if (kpis && kpis.coLocatedBlocks > 0) {
    events.push({
      id: `EV-COLOC-${snapshot.corridor.id}`,
      type: 'INFO',
      title: `${kpis.coLocatedBlocks} Multi-Department Shadow Blocks Formed`,
      detail: `${(kpis.colocationRate * 100).toFixed(0)}% co-location achieved across Civil, S&T and TRD, avoiding separate traffic shutdowns.`,
      time: 'Just now',
      tag: 'Optimiser'
    });
  }

  // 4. Rolling programme 10-week notice shortfall
  if (snapshot.result.rolling && snapshot.result.rolling.entries) {
    const shortfalls = snapshot.result.rolling.entries.filter((e) => e.status === 'NOTICE_SHORTFALL');
    if (shortfalls.length > 0) {
      events.push({
        id: `EV-ROLLING-SHORTFALL`,
        type: 'CRITICAL',
        title: `${shortfalls.length} Capital Works Have Notice Shortfall (<10 Weeks)`,
        detail: `Statutory 10-week advance notice for PRS / freight diversion not met for upcoming capital blocks.`,
        time: 'RBP Audit',
        tag: 'Rolling'
      });
    }
  }

  // 5. Overall Plan Status
  if (kpis) {
    events.push({
      id: `EV-PLAN-READY`,
      type: 'OK',
      title: `Plan Synchronized: ${snapshot.corridor.code}`,
      detail: `${kpis.blockCount} possessions, ${kpis.tasksScheduled}/${kpis.tasksTotal} works scheduled, ${(kpis.availability * 100).toFixed(1)}% corridor availability.`,
      time: 'Engine ready',
      tag: 'Status'
    });
  }

  return events;
}
