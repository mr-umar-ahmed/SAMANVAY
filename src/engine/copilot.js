/**
 * SAMANVAY copilot: a rule-based question router over the plan snapshot.
 *
 * It is not a language model. Each question is matched to one intent by
 * regular expressions; the answer is computed from the snapshot (tasks, the
 * weekly plan, the occupancy of the working timetable) and, when the caller
 * passes it, from the workflow records (approvals, requisitions, reports,
 * extensions, execution log, forms, power blocks, site messages).
 *
 * Every return carries `intent` and, for the structured intents, `data` with
 * the computed figures so the UI can write the answer in its own language.
 * `answer` is a plain English rendering of the same figures (for Node use).
 *
 * Pure isomorphic ES module (runs in the browser and under node --test).
 */
import { evaluateWindow } from './delayModel.js';
import { commonFreeWindows } from './occupancy.js';
import { RULES, WORK_TYPES } from './constants.js';
import { fmtDate, minToHHMM } from './time.js';
import { parseChainage, sectionsInRange } from './corridors.js';
import { corridorTag, disconnectionNoticeNo } from './cautionOrder.js';

const MIN_PER_DAY = 1440;

/* ── small helpers ──────────────────────────────────────────── */

function isoAddDays(iso, n) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

function dateText(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : fmtDate(d);
}

const dayIso = (snapshot, day) => isoAddDays(snapshot.planStart, day);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const linesMeet = (a, b) => a === 'BOTH' || b === 'BOTH' || a === b;

/**
 * Workflow state of one approval record (same rules as workflowState() in
 * select.ts, repeated here so this module stays plain JavaScript).
 */
export function workflowStateOf(a, departments) {
  if (!a) return 'DRAFT';
  if (a.status === 'GRANTED' || a.status === 'LOCKED' || a.status === 'REFUSED') return a.status;
  if (!a.proposedAt) return 'DRAFT';
  if (a.supersededAt) return 'SUPERSEDED';
  const depts = departments ?? a.geometry?.departments ?? [];
  return depts.length > 0 && depts.every((d) => !!a.concur?.[d]) ? 'CONCURRED' : 'PROPOSED';
}

/** Plan blocks with workflow state: the caller's working blocks when given, else the optimiser's blocks + approvals. */
function planBlocks(snapshot, ctx) {
  if (Array.isArray(ctx.blocks)) return ctx.blocks.map((b) => (b.state ? b : withState(b, ctx.approvals)));
  return (snapshot.result?.weekly?.ai?.blocks || []).map((b) => withState(b, ctx.approvals));
}

function withState(b, approvals) {
  const a = approvals?.[b.id] ?? null;
  const state = workflowStateOf(a, b.departments);
  if (a?.override) {
    const { start, end } = a.override;
    return { ...b, start, end, startText: minToHHMM(start), endText: minToHHMM(end), spanMin: end - start, approval: a, state, overridden: true };
  }
  return { ...b, approval: a, state, overridden: false };
}

const ACTIVE = (b) => b.state !== 'REFUSED' && b.state !== 'SUPERSEDED';

/** Where a work sits in the current plan. */
function placementOf(snapshot, blocks, taskId) {
  const ai = snapshot.result?.weekly?.ai;
  const s = ai?.scheduled?.find((x) => x.taskId === taskId) ?? null;
  const block = blocks.find((b) => b.tasks?.some((t) => t.id === taskId)) ?? null;
  const d = ai?.deferred?.find((x) => x.taskId === taskId) ?? null;
  const r = snapshot.result?.rolling?.entries?.find((x) => x.taskId === taskId) ?? null;
  const inBlock = block?.tasks.find((t) => t.id === taskId) ?? null;
  return {
    scheduled: s ? { day: s.day, date: dayIso(snapshot, s.day), line: s.line, start: s.start, end: s.end, startText: minToHHMM(s.start), endText: minToHHMM(s.end) } : null,
    blockId: block?.id ?? null,
    blockState: block?.state ?? null,
    blockWindow: block ? { day: block.day, date: block.date ?? dayIso(snapshot, block.day), start: block.start, end: block.end, startText: block.startText, endText: block.endText, line: block.line, overridden: !!block.overridden } : null,
    workWindow: inBlock ? { start: inBlock.start, end: inBlock.end, startText: inBlock.startText, endText: inBlock.endText } : null,
    deferredReason: d?.reason ?? null,
    rolling: r ? { weekLabel: r.weekLabel, start: r.start, end: r.end, workingDays: r.workingDays, status: r.status } : null,
  };
}

function placementSentence(p) {
  if (p.scheduled) {
    const w = p.blockWindow;
    return `Placed on ${dateText(p.scheduled.date)} ${p.scheduled.startText}–${p.scheduled.endText} (${p.scheduled.line} line)${p.blockId ? ` in block ${p.blockId}, ${p.blockState}` : ''}${w?.overridden ? `; Control changed the block window to ${w.startText}–${w.endText}` : ''}.`;
  }
  if (p.deferredReason) return `Not placed this week: ${p.deferredReason}.`;
  if (p.rolling) return `Capital work in the 26-week programme, ${p.rolling.weekLabel}.`;
  return 'Not in this week’s plan.';
}

function taskSummary(t) {
  return {
    id: t.id,
    sourceId: t.sourceId,
    label: t.label,
    workType: t.workType,
    dept: t.dept,
    sectionLabel: t.sectionLabel,
    line: t.line,
    startKm: t.startKm,
    endKm: t.endKm,
    totalMin: t.totalMin,
    arci: t.risk?.arci ?? null,
    mandatory: !!t.risk?.mandatory,
    dueDay: t.dueDay,
    closure: t.closure,
    capital: !!t.capital,
    injected: !!t.injected,
  };
}

/* ── intent: suggest a block for a work ─────────────────────── */

const SUGGEST_RES = [
  /\b(?:suggest|propose|recommend|find|give me|get me|show me|look for)\b[a-z\s]*?\b(?:block|window|slot|possession)s?\s+(?:for|to do|to carry out|to take)\s+(.+)/,
  /\b(?:best|free|next|possible|available|another|other|suitable|good)\s+(?:block|window|slot|possession)s?\s+for\s+(.+)/,
  /\bwhen\s+(?:can|could|should|shall|do|may)\s+(?:i|we|they|the gang|the unit|the section)\s+(?:do|take|carry out|schedule|plan|get|book|block for|have a block for)\s+(.+)/,
];

const STOP = new Set(['the', 'for', 'and', 'with', 'work', 'works', 'job', 'block', 'blocks', 'window', 'slot', 'possession', 'line', 'near', 'around', 'this', 'next', 'week', 'please', 'can', 'our', 'task', 'item', 'defect', 'from', 'section', 'day', 'today', 'tomorrow', 'night', 'maintenance']);

function parseSuggest(q) {
  let rest = null;
  for (const re of SUGGEST_RES) {
    const m = q.match(re);
    if (m) {
      rest = m[1];
      break;
    }
  }
  if (rest === null) return null;
  let km = null;
  const km1 = rest.match(/\b(?:at|near|around|from|on)?\s*km\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)/);
  if (km1) {
    km = parseChainage(km1[1].replace(/\s+/g, ''));
    rest = rest.replace(km1[0], ' ');
  }
  let line = null;
  const ln = rest.match(/\b(up|dn|down)\s+line\b|\bline\s+(up|dn|down)\b|\bon\s+(?:the\s+)?(up|dn|down)\b/);
  if (ln) {
    const v = ln[1] || ln[2] || ln[3];
    line = v === 'up' ? 'UP' : 'DN';
    rest = rest.replace(ln[0], ' ');
  }
  const target = rest.replace(/[?.!,;]+$/g, '').replace(/\s+/g, ' ').trim();
  return { target, km: Number.isFinite(km) ? km : null, line };
}

const ID_TOKEN_RE = /^[a-z]{2,6}-[a-z0-9#-]*\d[a-z0-9#-]*$/i;

/** Resolve the work named in a question: id / sourceId / requisition / report, else work type or label words. */
function resolveWork(snapshot, ctx, parsed) {
  const tasks = snapshot.tasks || [];
  const target = parsed.target;
  const lower = target.toLowerCase();
  const tokens = target.match(/[a-z0-9][a-z0-9_\-/#–.]*/gi) || [];

  // by id / sourceId (whole target or any token)
  for (const cand of [target, ...tokens]) {
    const c = cand.toLowerCase().replace(/[.]+$/, '');
    if (!c) continue;
    const byId = tasks.find((t) => t.id.toLowerCase() === c);
    if (byId) return { task: byId, matchedBy: 'id' };
    const bySrc = tasks.find((t) => (t.sourceId || '').toLowerCase() === c);
    if (bySrc) return { task: bySrc, matchedBy: 'sourceId' };
    const req = (ctx.requisitions || []).find((r) => r.id.toLowerCase() === c || (r.no || '').toLowerCase() === c);
    if (req) {
      const t = tasks.find((x) => x.sourceId === `REQ/${req.id}`);
      return t ? { task: t, matchedBy: 'requisition', ref: req.id } : { task: null, matchedBy: 'requisition', ref: req.id, refStatus: req.status, unplanned: true };
    }
    const rep = (ctx.reports || []).find((r) => r.id.toLowerCase() === c);
    if (rep) {
      const sid = rep.taskSpec?.sourceId ?? `REPORT/${rep.id}`;
      const t = tasks.find((x) => x.sourceId === sid);
      return t ? { task: t, matchedBy: 'report', ref: rep.id } : { task: null, matchedBy: 'report', ref: rep.id, refStatus: rep.status, unplanned: true };
    }
  }
  const idLike = tokens.find((tk) => ID_TOKEN_RE.test(tk) && !/_/.test(tk));
  if (idLike && !Object.keys(WORK_TYPES).some((k) => k.toLowerCase() === idLike.toLowerCase())) return { task: null, notFoundId: idLike.toUpperCase() };

  // by work type code, then by label words
  const norm = target.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  let types = Object.keys(WORK_TYPES).filter((k) => `_${norm}_`.includes(`_${k}_`));
  if (types.length > 1) {
    const longest = Math.max(...types.map((k) => k.length));
    types = types.filter((k) => k.length === longest);
  }
  if (!types.length) {
    const words = lower.split(/[^a-z0-9&]+/).filter((w) => w.length >= 3 && !STOP.has(w));
    let best = 0;
    for (const [k, wt] of Object.entries(WORK_TYPES)) {
      const hay = `${k.replace(/_/g, ' ')} ${wt.label}`.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean);
      const score = words.filter((w) => hay.some((h) => h.startsWith(w) || (w.length >= 5 && h.length >= 4 && w.startsWith(h)))).length;
      if (score > best) {
        best = score;
        types = [k];
      } else if (score === best && score > 0) types.push(k);
    }
  }
  if (!types.length) return { task: null };
  const pool = tasks.filter((t) => types.includes(t.workType));
  const workType = { code: types[0], label: WORK_TYPES[types[0]].label, codes: types };
  if (!pool.length) return { task: null, workType, matches: 0 };
  const dist = (t) => {
    if (parsed.km === null) return 0;
    const a = Math.min(t.startKm, t.endKm);
    const b = Math.max(t.startKm, t.endKm);
    return parsed.km < a ? a - parsed.km : parsed.km > b ? parsed.km - b : 0;
  };
  const lineOk = (t) => !parsed.line || t.line === parsed.line || t.line === 'BOTH';
  const ranked = [...pool].sort((x, y) => Number(lineOk(y)) - Number(lineOk(x)) || dist(x) - dist(y) || (y.risk?.arci ?? 0) - (x.risk?.arci ?? 0) || x.id.localeCompare(y.id));
  const task = ranked[0];
  return { task, matchedBy: 'workType', workType: { code: task.workType, label: WORK_TYPES[task.workType]?.label ?? task.label, codes: types }, matches: pool.length, kmDistance: parsed.km === null ? null : Math.round(dist(task) * 1000) / 1000 };
}

/** Optimiser alternatives for a work: its own (scope task) and the whole-block moves of the block holding it. */
function solverAlternatives(snapshot, blocks, taskId) {
  const ai = snapshot.result?.weekly?.ai;
  const own = (ai?.alternatives?.[taskId] || []).map((x) => ({ ...x, scope: x.scope || 'task' }));
  const block = blocks.find((b) => b.tasks?.some((t) => t.id === taskId));
  const raw = block ? (ai?.blocks || []).find((b) => b.id === block.id) : null;
  const whole = (raw?.alternatives || []).filter((x) => x.scope === 'block');
  const seen = new Set();
  const out = [];
  const byRank = (x, y) => Number(y.feasible) - Number(x.feasible) || x.deltaCost - y.deltaCost;
  for (const x of [...own.sort(byRank).slice(0, 3), ...whole.sort(byRank).slice(0, 2)]) {
    const k = `${x.scope}|${x.day}|${x.line}|${x.start}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...x, date: dayIso(snapshot, x.day), source: 'solver', blockId: x.scope === 'block' ? block?.id ?? null : null });
  }
  return out;
}

/**
 * Free-window scan of the working timetable for a work: every plan day and
 * every line the work can use, windows of max(work minutes, minimum block)
 * starting in the natural gaps of its sections (headway margin applied),
 * clear of this week's blocks on the same sections and line, each evaluated
 * with the delay model. Ranked: rule limits kept, (mandatory: on or before
 * the due day), premium paths, class-weighted delay, trains affected, day.
 */
function scanWindows(snapshot, blocks, spec) {
  const rules = { ...RULES, ...(snapshot.result?.rules || {}) };
  const margin = rules.headwayMarginMin;
  const need = Math.max(spec.totalMin, rules.minBlockMin);
  const occDays = snapshot.result?.weekly?.occupancy || [];
  const lineClosure = spec.closure !== 'NONE';
  const lines = spec.line === 'BOTH' ? ['BOTH'] : spec.line ? [spec.line] : snapshot.corridor?.lines || ['UP', 'DN'];
  const due = spec.mandatory ? Math.max(0, spec.dueDay ?? 0) : null;
  const cands = [];
  let clashes = 0;
  const seen = new Set();
  for (const d of occDays) {
    if (!d || !d.occ) continue;
    const dayOcc = { ...d, key: (s, l) => `${s}:${l}` };
    const dayBlocks = blocks.filter((b) => b.day === d.day && ACTIVE(b) && b.id !== spec.excludeBlockId);
    const closures = dayBlocks.filter((b) => b.lineClosure);
    for (const line of lines) {
      const starts = [];
      for (const w of commonFreeWindows(dayOcc, spec.sections, line, rules.minBlockMin, margin)) {
        const len = w.end - w.start;
        if (w.start + need <= MIN_PER_DAY) starts.push({ start: w.start, fits: len >= need });
        else if (w.end - need >= 0) starts.push({ start: w.end - need, fits: len >= need });
        if (len >= need + 30 && w.end - need !== w.start) starts.push({ start: w.end - need, fits: true });
      }
      for (const { start, fits } of starts) {
        const end = start + need;
        if (start < 0 || end > MIN_PER_DAY) continue;
        const key = `${d.day}|${line}|${start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const clash = dayBlocks.find((b) => linesMeet(b.line, line) && b.sections?.some((s) => spec.sections.includes(s)) && Math.max(b.start, start) < Math.min(b.end, end));
        if (clash) {
          clashes++;
          continue;
        }
        const ev = lineClosure ? evaluateWindow(dayOcc, spec.sections, line, start, end, rules) : { trains: [], weightedDelayMin: 0, rawDelayMin: 0, premiumConflicts: 0, feasible: true };
        const violations = [];
        if (lineClosure) {
          if (closures.length + 1 > rules.maxBlocksPerDay) violations.push({ rule: 'perDay', limit: rules.maxBlocksPerDay, value: closures.length + 1 });
          const concurrent = closures.filter((b) => Math.max(b.start, start) < Math.min(b.end, end)).length + 1;
          if (concurrent > rules.maxConcurrentBlocks) violations.push({ rule: 'concurrent', limit: rules.maxConcurrentBlocks, value: concurrent });
        }
        if (ev.premiumConflicts > 0) violations.push({ rule: 'premium', limit: 0, value: ev.premiumConflicts });
        cands.push({
          source: 'scan',
          day: d.day,
          date: d.date || dayIso(snapshot, d.day),
          line,
          start,
          end,
          startText: minToHHMM(start),
          endText: minToHHMM(end),
          fitsGap: fits && ev.trains.length === 0,
          trainsAffected: ev.trains.length,
          weightedDelayMin: ev.weightedDelayMin,
          premiumConflicts: ev.premiumConflicts,
          trains: [...ev.trains].sort((a, b) => b.weightedDelay - a.weightedDelay).slice(0, 4).map((t) => ({ number: t.number, name: t.name, cls: t.cls, mode: t.mode, delayMin: t.delayMin })),
          ruleViolations: violations,
          afterDue: due !== null && d.day > due,
        });
      }
    }
  }
  const ranked = cands.sort(
    (a, b) =>
      a.ruleViolations.length - b.ruleViolations.length ||
      Number(a.afterDue) - Number(b.afterDue) ||
      a.premiumConflicts - b.premiumConflicts ||
      a.weightedDelayMin - b.weightedDelayMin ||
      a.trainsAffected - b.trainsAffected ||
      a.day - b.day ||
      a.start - b.start
  );
  // one window per day and line, so the three answers spread over the week
  const picked = [];
  const used = new Set();
  for (const c of ranked) {
    const k = `${c.day}|${c.line}`;
    if (used.has(k)) continue;
    used.add(k);
    picked.push(c);
    if (picked.length === 3) break;
  }
  const sectionLabels = spec.sections.map((s) => snapshot.corridor?.blockSections?.find((x) => x.index === s)?.label ?? String(s));
  return {
    alternatives: picked,
    scan: {
      windowMin: need,
      workMin: spec.totalMin,
      marginMin: margin,
      minBlockMin: rules.minBlockMin,
      maxBlockMin: rules.maxBlockMin,
      exceedsMax: need > rules.maxBlockMin,
      lines,
      sections: sectionLabels,
      days: occDays.length,
      evaluated: cands.length,
      zeroTrainWindows: cands.filter((c) => c.fitsGap && !c.ruleViolations.length).length,
      clashesSkipped: clashes,
      lineClosure,
      mandatory: !!spec.mandatory,
      dueDay: due,
    },
  };
}

function suggestBlock(snapshot, ctx, parsed) {
  const blocks = planBlocks(snapshot, ctx);
  const res = resolveWork(snapshot, ctx, parsed);
  const base = { query: parsed, task: null, workType: res.workType ?? null, matchedBy: res.matchedBy ?? null, matches: res.matches ?? null, kmDistance: res.kmDistance ?? null, ref: res.ref ?? null, refStatus: res.refStatus ?? null, placement: null, basis: 'none', alternatives: [], scan: null };
  const links = [];

  if (res.notFoundId) {
    return {
      intent: 'suggest',
      data: { ...base, outcome: 'notFound', notFoundId: res.notFoundId },
      answer: `No work, requisition or report with id ${res.notFoundId} is in the current plan or records.`,
      dataSource: 'task register',
      links,
    };
  }
  if (res.unplanned) {
    return {
      intent: 'suggest',
      data: { ...base, outcome: 'unplanned' },
      answer: `${res.ref} (${res.refStatus}) has no work in the current plan yet. A requisition joins the plan when the cell accepts it and the plan is re-run; a report joins when it is converted to a work.`,
      dataSource: 'requisitions and reports',
      links: [{ type: res.matchedBy === 'report' ? 'report' : 'req', id: res.ref, text: `Open ${res.ref}` }],
    };
  }

  let spec = null;
  const task = res.task;
  const matchNote =
    res.matchedBy !== 'workType'
      ? ''
      : parsed.km !== null
        ? `${res.matches > 1 ? `Nearest of ${res.matches} ${res.workType.label} works to km ${parsed.km}` : `The only ${res.workType.label} work`} (${res.kmDistance} km away).\n`
        : `${res.matches > 1 ? `Highest-ARCI of ${res.matches} ${res.workType.label} works` : `The only ${res.workType.label} work`}.\n`;
  if (task) {
    const placement = placementOf(snapshot, blocks, task.id);
    base.task = taskSummary(task);
    base.placement = placement;
    links.push({ type: 'task', id: task.id, text: `Open ${task.id}` });
    if (placement.blockId) links.push({ type: 'block', id: placement.blockId, text: `Open ${placement.blockId}` });
    const alts = solverAlternatives(snapshot, blocks, task.id);
    if (alts.length) {
      const lines = alts.map((a) => `• ${dateText(a.date)} ${a.startText}–${a.endText} ${a.line}${a.scope === 'block' ? ' (whole block)' : ''}: ${plural(a.trainsAffected, 'train')}, ${a.weightedDelayMin} class-weighted train-min, ${plural(a.premiumConflicts, 'premium path')}${a.feasible ? `, plan cost ${a.deltaCost >= 0 ? '+' : ''}${Math.round(a.deltaCost)}` : ` — not feasible: ${a.reason}`}`);
      return {
        intent: 'suggest',
        data: { ...base, outcome: 'task', basis: 'solver', alternatives: alts },
        answer: `${matchNote}${task.label} (${task.id}) on ${task.sectionLabel}, ${task.line} line.\n${placementSentence(placement)}\n\nOther windows the optimiser evaluated (everything else held):\n${lines.join('\n')}`,
        dataSource: 'optimiser alternatives of the weekly plan',
        links,
      };
    }
    spec = { sections: task.sections, line: task.line, totalMin: task.totalMin, closure: task.closure, mandatory: !!task.risk?.mandatory, dueDay: task.dueDay, excludeBlockId: placement.blockId };
  } else if (res.workType) {
    const wt = WORK_TYPES[res.workType.code];
    if (parsed.km === null) {
      return {
        intent: 'suggest',
        data: { ...base, outcome: 'needKm' },
        answer: `No ${wt.label} work is in the register of ${snapshot.corridor.code}. Give a chainage (e.g. "… at km ${Math.round(snapshot.corridor.lengthKm / 2)}") and the free windows there will be scanned.`,
        dataSource: 'task register',
        links,
      };
    }
    const secs = sectionsInRange(snapshot.corridor, parsed.km, parsed.km).map((s) => s.index);
    if (!secs.length) {
      return {
        intent: 'suggest',
        data: { ...base, outcome: 'offCorridor', corridorKm: snapshot.corridor.lengthKm },
        answer: `km ${parsed.km} is not on ${snapshot.corridor.code} (km 0–${snapshot.corridor.lengthKm}).`,
        dataSource: 'corridor chainage',
        links,
      };
    }
    const totalMin = wt.durationMin + wt.setupMin + wt.clearanceMin;
    const closure = wt.blockKind === 'DISCONNECTION' || res.workType.code === 'TSS_MAINTENANCE' ? 'NONE' : 'LINE';
    base.workType = { ...res.workType, totalMin, standard: true };
    spec = { sections: secs, line: parsed.line, totalMin, closure, mandatory: false, dueDay: null, excludeBlockId: null };
  } else {
    return {
      intent: 'suggest',
      data: { ...base, outcome: 'notFound', notFoundId: null },
      answer: `${parsed.target ? `I could not tell which work "${parsed.target}" means.` : 'Name the work.'} Name a work id (e.g. ${snapshot.tasks?.[0]?.id ?? 'TMS-001'}), a requisition or report id, or a work type such as tamping, USFD or contact wire renewal.`,
      dataSource: 'task register',
      links,
    };
  }

  const { alternatives, scan } = scanWindows(snapshot, blocks, spec);
  const head = task ? `${matchNote}${task.label} (${task.id}) on ${task.sectionLabel}, ${task.line} line.\n${placementSentence(base.placement)}` : `${base.workType.label} at km ${parsed.km} (${scan.sections.join(', ')}), standard ${scan.workMin} min of work.`;
  const lines = alternatives.map((a) => `• ${dateText(a.date)} ${a.startText}–${a.endText} ${a.line}: ${plural(a.trainsAffected, 'train')}, ${a.weightedDelayMin} class-weighted train-min, ${plural(a.premiumConflicts, 'premium path')}${a.ruleViolations.length ? ` — breaks ${a.ruleViolations.map((v) => v.rule).join(', ')}` : ''}${a.afterDue ? ' — after the due day' : ''}`);
  return {
    intent: 'suggest',
    data: { ...base, outcome: task ? 'task' : 'workType', basis: 'scan', alternatives, scan },
    answer:
      `${head}\n\nThe optimiser has no alternative windows for it, so the working timetable was scanned: ${scan.days} days, ${scan.lines.join(' / ')} line, windows of ${scan.windowMin} min with ${scan.marginMin} min headway margins, clear of this week's blocks on the same sections (${scan.evaluated} evaluated, ${scan.clashesSkipped} skipped for a block clash).` +
      (scan.lineClosure ? '' : '\nThe work does not close the line (disconnection / feed work), so no train is held; the windows start in the gaps between trains on its sections.') +
      (scan.exceedsMax ? `\nThe work needs ${scan.windowMin} min, more than the ${scan.maxBlockMin} min block ceiling: it must be split or taken as a mega block with sanction.` : '') +
      `\n\n${lines.length ? lines.join('\n') : 'No window found in the week.'}`,
    dataSource: 'free-window scan of the working timetable with the delay model',
    links,
  };
}

/* ── intent: status of a block / requisition / report ───────── */

const STATUS_ID_RE = /\b(blk-[a-z0-9]+(?:-[a-z0-9]+)*|req-[a-z0-9]+|hz-[a-z0-9]+|bdms\/[a-z]+\/\d{4}\/\d+)\b/i;
const STATUS_WORD_RE = /\b(status|where is|where's|whereabouts|what happened|what's happening|what is happening|progress|state of|update on|position of|track)\b/;
const GENERIC_ID_RE = /\b([a-z]{2,6}-[a-z0-9#]+(?:-[a-z0-9]+)*)\b/i;

function parseStatus(q) {
  const m = q.match(STATUS_ID_RE);
  if (m) {
    const rest = q.replace(m[0], '').replace(/[^a-z]+/g, ' ').trim();
    if (STATUS_WORD_RE.test(q) || rest === '' || /^(of|about|for|on|show|check)?\s*(block|requisition|report|hazard|incident)?$/.test(rest)) return { token: m[1] };
    return null;
  }
  if (STATUS_WORD_RE.test(q)) {
    const g = q.match(GENERIC_ID_RE);
    if (g && !/^(single-line|co-located|re-plan|e-mail|t-)/.test(g[1])) return { token: g[1] };
  }
  return null;
}

function extensionSummary(list) {
  return {
    list: list.map((e) => ({ id: e.id, extraMin: e.extraMin, status: e.status, reason: e.reason, by: e.by, at: e.at, decidedBy: e.decidedBy ?? null, decidedAt: e.decidedAt ?? null, note: e.note ?? null })),
    pending: list.filter((e) => e.status === 'PENDING').length,
    approved: list.filter((e) => e.status === 'APPROVED').length,
    refused: list.filter((e) => e.status === 'REFUSED').length,
    approvedMin: list.filter((e) => e.status === 'APPROVED').reduce((s, e) => s + (e.extraMin || 0), 0),
    pendingMin: list.filter((e) => e.status === 'PENDING').reduce((s, e) => s + (e.extraMin || 0), 0),
  };
}

function blockStatus(snapshot, ctx, token) {
  const blocks = planBlocks(snapshot, ctx);
  const approvals = ctx.approvals || {};
  const upper = token.toUpperCase();
  let b = blocks.find((x) => x.id.toUpperCase() === upper) ?? null;
  let id = b?.id ?? Object.keys(approvals).find((k) => k.toUpperCase() === upper) ?? null;
  let movedFrom = null;
  if (!id) {
    const moved = Object.entries(approvals).find(([, a]) => (a.rekeyedFrom || '').toUpperCase() === upper);
    if (moved) {
      movedFrom = upper;
      id = moved[0];
      b = blocks.find((x) => x.id === id) ?? null;
    }
  }
  if (!id) return null;
  const a = approvals[id] ?? b?.approval ?? null;
  const g = a?.geometry ?? null;
  const raw = (snapshot.result?.weekly?.ai?.blocks || []).find((x) => x.id === id) ?? null;
  const state = b?.state ?? workflowStateOf(a, g?.departments);
  const departments = b?.departments ?? g?.departments ?? [];
  const block = b
    ? { inPlan: true, day: b.day, date: b.date ?? dayIso(snapshot, b.day), line: b.line, kind: b.kind, lineClosure: b.lineClosure, sectionText: b.sectionText, start: b.start, end: b.end, startText: b.startText, endText: b.endText, spanMin: b.spanMin, departments, taskIds: b.tasks.map((t) => t.id), trainsAffected: b.affectedTrains?.length ?? 0, weightedDelayMin: b.weightedDelayMin ?? 0, premiumConflicts: b.premiumConflicts ?? 0 }
    : g
      ? { inPlan: false, day: g.day, date: g.date ?? dayIso(snapshot, g.day), line: g.line, kind: null, lineClosure: null, sectionText: null, start: g.start, end: g.end, startText: minToHHMM(g.start), endText: minToHHMM(g.end), spanMin: g.end - g.start, departments, taskIds: g.taskIds, trainsAffected: null, weightedDelayMin: null, premiumConflicts: null }
      : { inPlan: false, day: null, date: null, line: null, kind: null, lineClosure: null, sectionText: null, start: null, end: null, startText: null, endText: null, spanMin: null, departments, taskIds: [], trainsAffected: null, weightedDelayMin: null, premiumConflicts: null };
  const concur = departments.map((d) => ({ dept: d, by: a?.concur?.[d]?.by ?? null, at: a?.concur?.[d]?.at ?? null, note: a?.concur?.[d]?.note ?? null }));
  const approval = a
    ? {
        proposedBy: a.proposedBy ?? null,
        proposedAt: a.proposedAt ?? null,
        concur,
        pending: concur.filter((c) => !c.by).map((c) => c.dept),
        objections: (a.objections || []).map((o) => ({ dept: o.dept, by: o.by, at: o.at, reason: o.reason })),
        grantedBy: a.grantedBy ?? null,
        grantedAt: a.grantedAt ?? null,
        lockedBy: a.lockedBy ?? null,
        lockedAt: a.lockedAt ?? null,
        refusal: a.refusal ?? null,
        override: a.override ? { start: a.override.start, end: a.override.end, startText: minToHHMM(a.override.start), endText: minToHHMM(a.override.end), by: a.override.by, at: a.override.at, planStartText: raw?.startText ?? null, planEndText: raw?.endText ?? null } : null,
        supersededAt: a.supersededAt ?? null,
        rekeyedFrom: a.rekeyedFrom ?? null,
        extendedMin: a.extendedMin ?? 0,
        incharge: a.incharge ?? null,
      }
    : null;
  const ext = extensionSummary((ctx.extensions || []).filter((e) => e.blockId === id));
  const rec = (ctx.executionLog || []).filter((r) => r.blockId === id).sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)))[0] ?? null;
  const execution = rec
    ? {
        status: rec.status,
        date: rec.date,
        plannedStart: rec.plannedStart,
        plannedEnd: rec.plannedEnd,
        plannedStartText: minToHHMM(rec.plannedStart),
        plannedEndText: minToHHMM(rec.plannedEnd),
        actualStart: rec.actualStart ?? null,
        actualEnd: rec.actualEnd ?? null,
        actualStartText: rec.actualStart != null ? minToHHMM(rec.actualStart) : null,
        actualEndText: rec.actualEnd != null ? minToHHMM(rec.actualEnd) : null,
        actualSpanMin: rec.actualSpanMin ?? null,
        itemsDone: (rec.items || []).filter((i) => i.done).length,
        items: (rec.items || []).length,
        overrunCause: rec.overrunCause ?? null,
        extendedMin: rec.extendedMin ?? 0,
        by: rec.by,
        source: rec.source,
      }
    : null;
  const pb = ctx.powerBlocks?.[id] ?? null;
  const msgs = (ctx.messages || []).filter((m) => m.blockId === id);
  const lastMsg = msgs.map((m) => m.at).sort().pop() ?? null;
  const smms = b ? b.tasks.filter((t) => t.dept === 'SMMS') : [];
  const t351 = smms.map((t) => {
    const no = disconnectionNoticeNo(snapshot.corridor, id, t.id);
    return { taskId: t.id, no, status: ctx.forms?.[no]?.status ?? null };
  });
  return {
    kind: 'block',
    id,
    movedFrom,
    state,
    block,
    approval,
    extensions: ext,
    execution,
    power: pb ? { status: pb.status, by: pb.by ?? null, at: pb.at ?? null } : null,
    powerNeeded: !!(b && String(b.kind).includes('POWER')),
    messages: { count: msgs.length, fromField: msgs.filter((m) => m.from !== 'control').length, fromControl: msgs.filter((m) => m.from === 'control').length, lastAt: lastMsg },
    t351,
  };
}

function landedWork(snapshot, blocks, sourceId) {
  const t = (snapshot.tasks || []).find((x) => x.sourceId === sourceId);
  if (!t) return null;
  return { taskId: t.id, label: t.label, sectionLabel: t.sectionLabel, line: t.line, injectedNote: t.injectedFields?.note ?? null, placement: placementOf(snapshot, blocks, t.id) };
}

function historyOf(list) {
  return (list || []).map((h) => ({ at: h.at, by: h.by, action: h.action, note: h.note ?? null }));
}

function requisitionStatus(snapshot, ctx, token) {
  const low = token.toLowerCase();
  const r = (ctx.requisitions || []).find((x) => x.id.toLowerCase() === low || (x.no || '').toLowerCase() === low);
  if (!r) return null;
  const blocks = planBlocks(snapshot, ctx);
  const landed = landedWork(snapshot, blocks, `REQ/${r.id}`);
  return {
    kind: 'req',
    id: r.id,
    req: {
      id: r.id,
      no: r.no,
      status: r.status,
      dept: r.dept,
      workType: r.workType,
      workLabel: WORK_TYPES[r.workType]?.label ?? r.workType,
      line: r.line,
      startKm: r.startKm,
      endKm: r.endKm,
      durationMin: r.durationMin,
      preferredDate: r.preferredDate ?? null,
      preferredWindow: r.preferredWindow ?? null,
      by: r.by,
      at: r.at,
      updatedAt: r.updatedAt,
      cellRemarks: r.cellRemarks ?? null,
      intakeTaskId: r.intakeTaskId ?? null,
      validation: r.validation || [],
      otherCorridor: !!(r.corridorId && snapshot.corridor && r.corridorId !== snapshot.corridor.id),
    },
    history: historyOf(r.history),
    landed,
    awaitingReplan: r.status === 'ACCEPTED' && !landed,
  };
}

function reportStatus(snapshot, ctx, token) {
  const low = token.toLowerCase();
  const r = (ctx.reports || []).find((x) => x.id.toLowerCase() === low);
  if (!r) return null;
  const blocks = planBlocks(snapshot, ctx);
  const converted = r.status === 'TASK' || !!r.intakeTaskId;
  const landed = converted ? landedWork(snapshot, blocks, r.taskSpec?.sourceId ?? `REPORT/${r.id}`) : null;
  return {
    kind: 'report',
    id: r.id,
    report: {
      id: r.id,
      status: r.status,
      category: r.category,
      severity: r.severity ?? null,
      severityAuto: !!r.severityAuto,
      severityReasons: r.severityReasons || [],
      dept: r.dept ?? null,
      assignee: r.assignee ?? null,
      at: r.at,
      source: r.source,
      km: r.km ?? null,
      line: r.line ?? null,
      nearestStation: r.nearestStation ?? null,
      description: String(r.description || '').slice(0, 160),
      intakeTaskId: r.intakeTaskId ?? null,
      otherCorridor: !!(r.corridorId && snapshot.corridor && r.corridorId !== snapshot.corridor.id),
    },
    history: historyOf(r.history),
    landed,
    awaitingReplan: converted && !landed,
  };
}

function statusText(d) {
  if (d.kind === 'block') {
    const w = d.block;
    const parts = [`Block ${d.id}${d.movedFrom ? ` (was ${d.movedFrom})` : ''}: ${d.state}.`];
    if (w.date) parts.push(`${dateText(w.date)} ${w.startText}–${w.endText}, ${w.line}${w.sectionText ? `, ${w.sectionText}` : ''}${w.inPlan ? '' : ' (not in the current plan)'}.`);
    if (d.approval) {
      const ap = d.approval;
      if (ap.proposedAt) parts.push(`Sent by ${ap.proposedBy ?? 'the planning cell'} at ${ap.proposedAt}.`);
      for (const c of ap.concur) parts.push(c.by ? `${c.dept} concurred (${c.by}, ${c.at}).` : `${c.dept} concurrence pending.`);
      for (const o of ap.objections) parts.push(`${o.dept} objected (${o.by}, ${o.at}): ${o.reason}.`);
      if (ap.grantedAt) parts.push(`Granted by ${ap.grantedBy} at ${ap.grantedAt}.`);
      if (ap.lockedAt) parts.push(`Locked by ${ap.lockedBy} at ${ap.lockedAt}.`);
      if (ap.refusal) parts.push(`Refused by ${ap.refusal.by}: ${ap.refusal.reason}.`);
      if (ap.override) parts.push(`Control changed the window to ${ap.override.startText}–${ap.override.endText} (${ap.override.by}).`);
    }
    if (d.extensions.list.length) parts.push(`Extensions: ${d.extensions.pending} pending, ${d.extensions.approved} approved (${d.extensions.approvedMin} min), ${d.extensions.refused} refused.`);
    if (d.execution) parts.push(`Execution: ${d.execution.status}${d.execution.actualStartText ? `, started ${d.execution.actualStartText}` : ''}${d.execution.actualEndText ? `, cleared ${d.execution.actualEndText}` : ''}, ${d.execution.itemsDone} of ${d.execution.items} works done.`);
    else parts.push('No execution record.');
    if (d.power) parts.push(`Power block: ${d.power.status}.`);
    parts.push(`${plural(d.messages.count, 'site message')}.`);
    return parts.join('\n');
  }
  if (d.kind === 'req') {
    const r = d.req;
    const where = d.landed ? placementSentenceShort(d.landed) : d.awaitingReplan ? 'Accepted; the work joins the plan on the next run.' : '';
    return `Requisition ${r.no} (${r.id}): ${r.status}. ${r.dept}, ${r.workLabel}, ${r.line} km ${r.startKm}–${r.endKm}.${r.cellRemarks ? ` Cell remarks: ${r.cellRemarks}.` : ''}\n${d.history.map((h) => `• ${h.at} ${h.action} (${h.by})${h.note ? `: ${h.note}` : ''}`).join('\n')}${where ? `\n${where}` : ''}`;
  }
  const r = d.report;
  const where = d.landed ? placementSentenceShort(d.landed) : d.awaitingReplan ? 'Converted to a work; it joins the plan on the next run.' : '';
  return `Report ${r.id}: ${r.status}. ${r.category}, severity ${r.severity ?? 'not rated'}${r.severityAuto ? ' (rule-based)' : ''}, ${r.dept ?? 'Control'}${r.assignee ? `, assigned to ${r.assignee}` : ''}.\n${d.history.map((h) => `• ${h.at} ${h.action} (${h.by})${h.note ? `: ${h.note}` : ''}`).join('\n')}${where ? `\n${where}` : ''}`;
}

function placementSentenceShort(l) {
  const p = l.placement;
  if (p.scheduled) return `The work ${l.taskId} is placed on ${dateText(p.scheduled.date)} ${p.scheduled.startText}–${p.scheduled.endText}${p.blockId ? ` in block ${p.blockId} (${p.blockState})` : ''}.`;
  if (p.deferredReason) return `The work ${l.taskId} is not placed this week: ${p.deferredReason}.`;
  return `The work ${l.taskId} is in the plan but not in this week.`;
}

function statusOf(snapshot, ctx, token) {
  const tok = token.trim();
  const low = tok.toLowerCase();
  let d = null;
  if (low.startsWith('blk-')) d = blockStatus(snapshot, ctx, tok);
  else if (low.startsWith('req-') || low.startsWith('bdms/')) d = requisitionStatus(snapshot, ctx, tok);
  else if (low.startsWith('hz-')) d = reportStatus(snapshot, ctx, tok);
  else {
    // a work id: answer where the work is placed (the suggest intent carries its placement)
    const task = (snapshot.tasks || []).find((t) => t.id.toLowerCase() === low || (t.sourceId || '').toLowerCase() === low);
    if (task) return suggestBlock(snapshot, ctx, { target: task.id, km: null, line: null });
    d = requisitionStatus(snapshot, ctx, tok) ?? reportStatus(snapshot, ctx, tok) ?? blockStatus(snapshot, ctx, tok);
  }
  if (!d) {
    return {
      intent: 'status',
      data: { kind: 'notFound', id: tok.toUpperCase() },
      answer: `${tok.toUpperCase()} was not found. Ids understood: blocks (BLK-…), requisitions (REQ-… or the BDMS number), hazard reports (HZ-…) and works (e.g. ${snapshot.tasks?.[0]?.id ?? 'TMS-001'}).`,
      dataSource: 'plan and workflow records',
      links: [],
    };
  }
  const links = [];
  if (d.kind === 'block') {
    if (d.block.inPlan) links.push({ type: 'block', id: d.id, text: `Open ${d.id}` });
  } else {
    links.push({ type: d.kind, id: d.id, text: `Open ${d.id}` });
    if (d.landed) {
      links.push({ type: 'task', id: d.landed.taskId, text: `Open ${d.landed.taskId}` });
      if (d.landed.placement.blockId) links.push({ type: 'block', id: d.landed.placement.blockId, text: `Open ${d.landed.placement.blockId}` });
    }
  }
  return { intent: 'status', data: d, answer: statusText(d), dataSource: 'workflow records', links };
}

/* ── intent: today's report ─────────────────────────────────── */

const TODAY_RE = /\b(?:today['’]?s|daily|day['’]?s)\s+(?:report|summary|position|brief|sitrep|status)\b|\b(?:report|summary|position|brief|sitrep)\s+(?:for|of)\s+(?:today|the day)\b|\btoday\s+(?:report|summary|so far)\b|\bsitrep\b|\bhow\s+is\s+today\s+going\b/;

const SEVERITIES = ['high', 'medium', 'low'];

function countBy(list, key, values) {
  const out = Object.fromEntries(values.map((v) => [v, 0]));
  for (const x of list) {
    const k = key(x);
    if (k in out) out[k]++;
  }
  return out;
}

function todayReport(snapshot, ctx) {
  const blocks = planBlocks(snapshot, ctx);
  const date = snapshot.planStart;
  const day0 = blocks.filter((b) => b.day === 0);
  const byState = countBy(day0, (b) => b.state, ['DRAFT', 'PROPOSED', 'CONCURRED', 'GRANTED', 'LOCKED', 'REFUSED', 'SUPERSEDED']);
  const day0Ids = new Set(day0.map((b) => b.id));
  const corridorId = snapshot.corridor?.id;
  const recs = (ctx.executionLog || []).filter((r) => (!r.corridorId || r.corridorId === corridorId) && (r.date === date || day0Ids.has(r.blockId)));
  const cleared = recs.filter((r) => r.status !== 'IN_PROGRESS');
  const execution = {
    records: recs.length,
    started: recs.length,
    inProgress: recs.length - cleared.length,
    cleared: cleared.length,
    clearedLate: cleared.filter((r) => r.actualEnd != null && r.actualEnd > r.plannedEnd + (r.extendedMin || 0)).length,
  };

  let conflicts = null;
  if (Array.isArray(ctx.conflicts)) {
    const safety = (c) => c.kind === 'SAFETY' || c.kind === 'DEFERRED_MANDATORY';
    const today = ctx.conflicts.filter((c) => c.day === 0);
    conflicts = {
      today: { total: today.length, ...countBy(today, (c) => c.severity, SEVERITIES) },
      week: { total: ctx.conflicts.length, ...countBy(ctx.conflicts, (c) => c.severity, SEVERITIES) },
      safetyToday: today.filter(safety).length,
      safetyWeek: ctx.conflicts.filter(safety).length,
    };
  }
  const running = Array.isArray(ctx.running) ? { count: ctx.running.length, maxOverMin: ctx.running.reduce((m, r) => Math.max(m, r.overMin || 0), 0), blockIds: ctx.running.map((r) => r.block?.id ?? r.record?.blockId).filter(Boolean) } : null;
  const overrunAnoms = (snapshot.anomalies || []).filter((a) => a.kind === 'OVERRUN');
  const anomalies = { overrun: overrunAnoms.length, ...countBy(overrunAnoms, (a) => a.severity, SEVERITIES) };
  const open = (ctx.reports || []).filter((r) => (!r.corridorId || r.corridorId === corridorId) && (r.status === 'UNVERIFIED' || r.status === 'TRIAGED'));
  const incidents = { open: open.length, ...countBy(open, (r) => r.severity ?? 'unrated', [...SEVERITIES, 'unrated']), unverified: open.filter((r) => r.status === 'UNVERIFIED').length, triaged: open.filter((r) => r.status === 'TRIAGED').length };
  const pend = (ctx.extensions || []).filter((e) => e.status === 'PENDING');
  const extensions = { pending: pend.length, pendingMin: pend.reduce((s, e) => s + (e.extraMin || 0), 0) };
  const tag = corridorTag(snapshot.corridor);
  const forms = Object.entries(ctx.forms || {});
  const caution = {
    issued: forms.filter(([no, f]) => (no.startsWith(`T/409/${tag}/`) || no.startsWith(`T/409B/${tag}/`)) && f.status === 'ISSUED').length,
    t351Issued: forms.filter(([no, f]) => no.startsWith(`T/351/${tag}/`) && f.status === 'ISSUED').length,
  };
  const data = { day: 0, date, nowMinute: Number.isFinite(ctx.nowMinute) ? ctx.nowMinute : null, blocks: { total: day0.length, byState, lineClosures: day0.filter((b) => b.lineClosure).length }, execution, conflicts, running, anomalies, incidents, extensions, caution };

  const st = Object.entries(byState).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
  const answer = [
    `Today = plan day 0, ${dateText(date)}${data.nowMinute !== null ? `; wall clock ${minToHHMM(data.nowMinute)} IST` : ''}.`,
    `• Blocks today: ${day0.length}${st ? ` (${st})` : ''}.`,
    `• Possessions: ${execution.started} started, ${execution.cleared} cleared, ${execution.inProgress} in progress.`,
    conflicts ? `• Conflicts today: ${conflicts.today.total} (high ${conflicts.today.high}, medium ${conflicts.today.medium}, low ${conflicts.today.low}); week ${conflicts.week.total}; safety conflicts in the week ${conflicts.safetyWeek}.` : null,
    running ? `• Running past planned end now: ${running.count}${running.count ? `, worst ${running.maxOverMin} min` : ''}.` : null,
    `• Overrun anomalies in the execution history: ${anomalies.overrun}.`,
    `• Open incidents: ${incidents.open} (high ${incidents.high}, medium ${incidents.medium}, low ${incidents.low}, not rated ${incidents.unrated}).`,
    `• Extensions pending: ${extensions.pending}.`,
    `• Caution orders issued: ${caution.issued}.`,
  ]
    .filter(Boolean)
    .join('\n');
  const links = day0.slice(0, 3).map((b) => ({ type: 'block', id: b.id, text: `Open ${b.id}` }));
  return { intent: 'today', data, answer, dataSource: 'plan day 0, workflow records and execution log', links };
}

/* ── router ─────────────────────────────────────────────────── */

const PNR_RE = /\bpnr\b|\b\d{10}\b/;

/**
 * Route a question to one intent and compute the answer.
 * @param {string} query
 * @param {any} snapshot the plan snapshot (null while the worker runs)
 * @param {any} [ctx] workflow records from the store: { blocks, approvals, requisitions, reports, extensions, executionLog, forms, powerBlocks, messages, conflicts, running, nowMinute }
 */
export function askCopilot(query, snapshot, ctx = {}) {
  if (!snapshot) {
    return { intent: 'pending', answer: 'The plan is still being computed. Ask again when it is ready.', dataSource: 'plan not loaded', links: [] };
  }
  const c = ctx || {};
  const q = String(query ?? '').trim().toLowerCase();
  const tasks = snapshot.tasks || [];
  const weekly = snapshot.result?.weekly;
  const kpis = weekly?.kpis;
  const baseKpis = weekly?.baseKpis;
  const delta = weekly?.delta;
  const blocks = planBlocks(snapshot, c);

  // Passenger reservation is not SAMANVAY's data (asked before anything else so a 10-digit number never reaches an id matcher).
  if (PNR_RE.test(q) && !STATUS_ID_RE.test(q)) {
    return { intent: 'outOfScope', answer: 'Passenger reservation (PNR) data is out of scope for SAMANVAY. It plans maintenance blocks; it has no link to the reservation system.', dataSource: 'scope of SAMANVAY', links: [] };
  }

  // New intents first, so the loose matchers below cannot take them.
  if (TODAY_RE.test(q)) return todayReport(snapshot, c);
  const sug = parseSuggest(q);
  if (sug) return suggestBlock(snapshot, c, sug);
  const st = parseStatus(q);
  if (st) return statusOf(snapshot, c, st.token);

  // 1. "Why is task X first / top priority?"
  const whyTaskMatch = q.match(/why.*(?:task|item|defect|work)\s+([a-z0-9_-]+)/i) || (q.includes('why') && (q.includes('first') || q.includes('top')) ? ['first', null] : null);
  if (whyTaskMatch) {
    const targetId = whyTaskMatch[1];
    let task = targetId ? tasks.find((t) => t.id.toLowerCase() === targetId.toLowerCase() || t.sourceId?.toLowerCase() === targetId.toLowerCase()) : null;
    if (!task) task = [...tasks].sort((a, b) => b.risk.arci - a.risk.arci)[0];
    if (task) {
      const r = task.risk;
      const terms = r.explanation.map((e) => `• ${e.label} (${e.value.toFixed(2)}): ${e.text}`).join('\n');
      const p = placementOf(snapshot, blocks, task.id);
      return {
        intent: 'why',
        answer:
          `Task ${task.id} (${task.label}) on ${task.sectionLabel} (${task.line} line) has an ARCI of ${r.arci.toFixed(2)} (${r.urgencyLabel}).\n\nWhy this rank:\n${terms}\n\n` +
          (r.mandatory ? `${/^mandatory/i.test(r.mandatoryReason || '') ? r.mandatoryReason : `Mandatory: ${r.mandatoryReason || 'raised to the mandatory floor'}`}.\n` : '') +
          placementSentence(p),
        dataSource: 'ARCI risk engine (Weibull fits and escalation model)',
        links: [{ type: 'task', id: task.id, text: `Open ${task.id}` }],
      };
    }
  }

  // 2. "What blocks are on day D?"
  const dayMatch = q.match(/(?:day\s*(\d)|today|tomorrow)/i);
  if (q.includes('block') && dayMatch) {
    let dayIdx = 0;
    if (dayMatch[1]) dayIdx = Math.min(6, Math.max(0, parseInt(dayMatch[1], 10)));
    else if (q.includes('tomorrow')) dayIdx = 1;
    const dayBlocks = blocks.filter((b) => b.day === dayIdx && b.state !== 'REFUSED').sort((a, b) => a.start - b.start);
    const when = dateText(dayIso(snapshot, dayIdx));
    if (dayBlocks.length === 0) {
      return { intent: 'day', data: { day: dayIdx }, answer: `No possessions are planned on ${when}.`, dataSource: 'weekly plan', links: [] };
    }
    const items = dayBlocks.map((b) => `• ${b.id} ${b.startText}–${b.endText} (${b.spanMin} min): ${b.sectionText} ${b.line} · ${b.departments.join(' + ')}${b.coLocated ? ' · joint block' : ''} · ${b.state}`).join('\n');
    return {
      intent: 'day',
      data: { day: dayIdx },
      answer: `${plural(dayBlocks.length, 'possession')} planned on ${when}:\n\n${items}`,
      dataSource: 'weekly plan (optimiser output)',
      links: dayBlocks.slice(0, 3).map((b) => ({ type: 'block', id: b.id, text: `Open ${b.id}` })),
    };
  }

  // 3. "Which trains are affected by block X?"
  const blockMatch = q.match(/block\s+([a-z0-9_-]+)/i);
  if (blockMatch) {
    const bId = blockMatch[1].toUpperCase();
    const b = blocks.find((x) => x.id.toUpperCase() === bId);
    if (b) {
      const affected = b.affectedTrains || [];
      if (affected.length === 0) {
        return { intent: 'trains', data: { blockId: b.id }, answer: `Block ${b.id} fits a gap in the working timetable: no train is held, regulated or worked over the other line.`, dataSource: 'delay model over the working timetable', links: [{ type: 'block', id: b.id, text: `Open ${b.id}` }] };
      }
      const trainList = affected.map((t) => `• ${t.number} ${t.name} (${t.cls}): ${t.mode}, ${t.delayMin} min`).join('\n');
      return {
        intent: 'trains',
        data: { blockId: b.id },
        answer: `Block ${b.id} affects ${plural(affected.length, 'train')}:\n\n${trainList}\n\nClass-weighted delay: ${b.weightedDelayMin} train-minutes.`,
        dataSource: 'delay model over the working timetable',
        links: [{ type: 'block', id: b.id, text: `Open ${b.id}` }],
      };
    }
  }

  // 4. TSRs / speed restrictions
  if (q.includes('tsr') || q.includes('caution') || q.includes('speed restriction')) {
    const tsrTasks = tasks.filter((t) => t.tsrKmph);
    if (tsrTasks.length === 0) return { intent: 'tsr', answer: 'No register work carries a TSR on this corridor.', dataSource: 'TMS / SMMS / TDMS registers', links: [] };
    const list = tsrTasks.map((t) => `• ${t.id}: ${t.tsrKmph} km/h on ${t.sectionLabel} (${t.line})${t.tsrSinceDays ? `, in force ${t.tsrSinceDays} d` : ''} — ${t.label}`).join('\n');
    return {
      intent: 'tsr',
      answer: `${plural(tsrTasks.length, 'TSR')} from the registers on ${snapshot.corridor.code}:\n\n${list}${kpis ? `\n\nTrain-minutes lost to these TSRs this week under the plan: ${Math.round(kpis.tsrTrainMinutes)}.` : ''}`,
      dataSource: 'TMS / SMMS / TDMS registers',
      links: [],
    };
  }

  // 5. Compare with the baseline
  if (q.includes('baseline') || q.includes('compare') || q.includes('advantage') || q.includes('benefit') || q.includes('roi')) {
    if (delta && kpis && baseKpis) {
      return {
        intent: 'baseline',
        answer:
          `Plan against the simulated decentralised baseline (same seed):\n\n` +
          `• Possessions: ${kpis.blockCount} vs ${baseKpis.blockCount} (${delta.blocksAvoided} fewer)\n` +
          `• Co-location of closure works: ${(kpis.colocationRate * 100).toFixed(1)} % vs ${(baseKpis.colocationRate * 100).toFixed(1)} %\n` +
          `• Corridor availability: ${(kpis.availability * 100).toFixed(2)} % (${delta.availabilityPoints >= 0 ? '+' : ''}${delta.availabilityPoints.toFixed(2)} points)\n` +
          `• Section-line hours returned to traffic: ${delta.sectionLineHoursSaved.toFixed(1)}\n` +
          `• Class-weighted train delay: ${kpis.weightedDelayMin} vs ${baseKpis.weightedDelayMin} train-minutes\n` +
          `• Mandatory works in time: ${kpis.mandatoryCompliant} of ${kpis.mandatoryTotal}\n` +
          `• Estimated value this week (unit rates are assumptions): Rs ${(delta.estRupeesSaved / 1e5).toFixed(1)} lakh`,
        dataSource: 'KPI engine, like-for-like against the baseline',
        links: [],
      };
    }
  }

  // 6. Top priority works
  if (q.includes('critical') || q.includes('priority') || q.includes('top') || q.includes('urgent')) {
    const top = [...tasks].sort((a, b) => b.risk.arci - a.risk.arci).slice(0, 5);
    const list = top.map((t, idx) => `${idx + 1}. **${t.id}** (${t.dept}): ${t.label} on **${t.sectionLabel}** [ARCI **${t.risk.arci.toFixed(2)}**]`).join('\n');
    return {
      intent: 'top',
      answer: `**Top ${top.length} works by ARCI on ${snapshot.corridor.code}:**\n\n${list}\n\nRanked by the Asset Risk & Criticality Index; open a work for its explanation.`,
      dataSource: 'ARCI ranking of the task register',
      links: top.slice(0, 3).map((t) => ({ type: 'task', id: t.id, text: `Open ${t.id}` })),
    };
  }

  // Not matched
  return {
    intent: 'help',
    answer:
      `This is a rule-based router over the current plan, not a language model. Questions it understands:\n` +
      `• Why is task ${tasks[0]?.id ?? 'TMS-001'} ranked where it is?\n` +
      `• What blocks are planned tomorrow?\n` +
      `• Which trains are affected by block ${blocks[0]?.id ?? 'BLK-…'}?\n` +
      `• Show TSRs in force\n` +
      `• Compare the plan with the baseline\n` +
      `• Top priority works\n` +
      `• Suggest a block for ${tasks[0]?.id ?? 'TMS-001'} (or for tamping at km 142)\n` +
      `• Status of ${blocks[0]?.id ?? 'BLK-…'} / REQ-… / HZ-…\n` +
      `• Today's report`,
    dataSource: 'question router',
    links: [],
  };
}
