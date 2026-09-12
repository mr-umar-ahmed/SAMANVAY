/**
 * Plain EN / HI sentences for the conflicts view, built from the kind and
 * params of select.conflictsFor() (which carries no prose), plus the rows
 * conflictsFor does not produce: optimiser hard-rule reasons for
 * dependencies, co-requisite blocks and the JPO length limit, and the
 * dependency / joint-block requirements of requisition works (met or not).
 * Engine reasons that are English text (safety reasons, deferral reasons)
 * are translated when they are one of the engine's fixed phrases and shown
 * as given otherwise.
 */
import { WORK_TYPES } from '../../engine/constants.js';
import type { Conflict, ConflictSeverity, WorkingBlock } from '../../engine/select';
import type { Snapshot } from '../../engine/types';
import type { Lang } from '../../i18n';
import { translate } from '../../i18n';
import { addDaysIso, dateLabel, hhmm } from '../../lib/format';

export const conflictStrings = {
  en: {
    MACHINE_OVERLAP: 'Machine {machine} is booked in block {block} and block {other} at the same time ({window}).',
    MACHINE_PLAN: 'The optimiser could not free a machine: {detail}.',
    CREW_OVERLAP: 'Gang {crew} is booked in block {block} and block {other} at the same time ({window}).',
    CREW_PLAN: 'The optimiser could not free a gang: {detail}.',
    INCOMPATIBLE: 'Incompatible works in one block: {a} with {b}.',
    CONCURRENCY: '{count} possessions at the same time on {day} (limit {limit}).',
    BLOCKS_PER_DAY: '{count} possessions on {day} (limit {limit}).',
    BLOCKS_PER_DAY_PLAN: 'More possessions on {day} than the limit of {limit}.',
    PREMIUM_PATH: '{count} premium train path(s) cross block {block} ({window}).',
    T351_PENDING: 'T/351 not received for {pending} of {total} S&T work(s) in block {block}.',
    POWER_isolate: 'OHE isolation not yet recorded for power block {block} ({isolation}).',
    POWER_isolateStarted: 'Possession started in block {block} but OHE is not recorded as de-energised ({isolation}).',
    POWER_reenergise: 'Block {block} is cleared but OHE is still recorded as de-energised — record re-energisation.',
    OBJECTION: '{dept} objected to block {block}: {reason} ({by}).',
    SAFETY: 'Safety conflict: mandatory work {label} cannot be placed on or before its due day ({due}) — {reason}.',
    SAFETY_PLACED: 'placed on {placed}',
    SAFETY_UNPLACED: 'not placed this week',
    DEFERRED_MANDATORY: 'Mandatory work {label} ({section}) was deferred — {reason}.',
    SUPERSEDED: 'Block {block} ({works} works) was changed by a re-plan after it was sent — the new block must be sent again.',
    SUPERSEDED_HELD: '{status} block {block} ({works} works) is no longer in the plan.',
    DEP_UNSCHEDULED: 'Work {task} depends on {pre}, which is not scheduled.',
    DEP_ORDER: 'Work {task} must start after {pre} ends.',
    COREQ: 'Works {a} and {b} must share one block.',
    JPO_LIMIT: 'A block on {day} exceeds the JPO limit of {hours} h.',
    PREMIUM_DAY: 'A premium train path conflict on {day}.',
    BEYOND_DUE: 'Mandatory work {task} is placed after its due day.',
    RESOURCE_machine: 'No machine available for work {task} in its window.',
    RESOURCE_gang: 'No gang available for work {task} in its window.',
    OTHER: 'Hard rule broken: {text}.',
    noDay: 'this week',
  },
  hi: {
    MACHINE_OVERLAP: 'मशीन {machine} block {block} और block {other} में एक ही समय ({window}) बुक है।',
    MACHINE_PLAN: 'ऑप्टिमाइज़र मशीन मुक्त नहीं कर सका: {detail}।',
    CREW_OVERLAP: 'गैंग {crew} block {block} और block {other} में एक ही समय ({window}) बुक है।',
    CREW_PLAN: 'ऑप्टिमाइज़र गैंग मुक्त नहीं कर सका: {detail}।',
    INCOMPATIBLE: 'एक block में असंगत कार्य: {a} के साथ {b}।',
    CONCURRENCY: '{day} को एक साथ {count} पज़ेशन (सीमा {limit})।',
    BLOCKS_PER_DAY: '{day} को {count} पज़ेशन (सीमा {limit})।',
    BLOCKS_PER_DAY_PLAN: '{day} को {limit} की सीमा से अधिक पज़ेशन।',
    PREMIUM_PATH: '{count} प्रीमियम ट्रेन पथ block {block} ({window}) को काटते हैं।',
    T351_PENDING: 'block {block} के {total} में से {pending} S&T कार्यों का T/351 प्राप्त नहीं।',
    POWER_isolate: 'पावर block {block} ({isolation}) का OHE आइसोलेशन अभी दर्ज नहीं।',
    POWER_isolateStarted: 'block {block} में पज़ेशन शुरू, पर OHE डी-एनर्जाइज़्ड दर्ज नहीं ({isolation})।',
    POWER_reenergise: 'block {block} क्लियर है पर OHE अभी भी डी-एनर्जाइज़्ड दर्ज है — पुनः एनर्जाइज़ेशन दर्ज करें।',
    OBJECTION: '{dept} ने block {block} पर आपत्ति की: {reason} ({by})।',
    SAFETY: 'सुरक्षा टकराव: अनिवार्य कार्य {label} अपने देय दिन ({due}) तक नहीं रखा जा सकता — {reason}।',
    SAFETY_PLACED: '{placed} को रखा गया',
    SAFETY_UNPLACED: 'इस सप्ताह नहीं रखा गया',
    DEFERRED_MANDATORY: 'अनिवार्य कार्य {label} ({section}) स्थगित — {reason}।',
    SUPERSEDED: 'भेजे जाने के बाद block {block} ({works} कार्य) पुनः योजना से बदल गया — नया block फिर से भेजना होगा।',
    SUPERSEDED_HELD: '{status} block {block} ({works} कार्य) अब योजना में नहीं है।',
    DEP_UNSCHEDULED: 'कार्य {task} {pre} पर निर्भर है, जो नियोजित नहीं है।',
    DEP_ORDER: 'कार्य {task} को {pre} के समाप्त होने के बाद शुरू होना चाहिए।',
    COREQ: 'कार्य {a} और {b} को एक ही block साझा करना चाहिए।',
    JPO_LIMIT: '{day} का एक block {hours} घं. की JPO सीमा से अधिक है।',
    PREMIUM_DAY: '{day} को प्रीमियम ट्रेन पथ टकराव।',
    BEYOND_DUE: 'अनिवार्य कार्य {task} अपने देय दिन के बाद रखा गया है।',
    RESOURCE_machine: 'कार्य {task} की खिड़की में कोई मशीन उपलब्ध नहीं।',
    RESOURCE_gang: 'कार्य {task} की खिड़की में कोई गैंग उपलब्ध नहीं।',
    OTHER: 'कठोर नियम टूटा: {text}।',
    noDay: 'इस सप्ताह',
  },
} as const;

export type ConflictKey = keyof typeof conflictStrings.en;

/** The engine's fixed safety / deferral reason phrases (scheduler.js explainSafety) in Hindi. */
const REASON_HI: Record<string, string> = {
  'Rule: blocks per day': 'नियम: प्रति दिन block',
  'Rule: simultaneous possessions': 'नियम: एक साथ पज़ेशन',
  'A premium train path crosses every earlier window': 'हर पहले की खिड़की को एक प्रीमियम ट्रेन पथ काटता है',
  'Incompatible work already planned in the same block': 'उसी block में असंगत कार्य पहले से नियोजित',
  'Rule: block length limit': 'नियम: block अवधि सीमा',
  'Waits for a predecessor work': 'पूर्ववर्ती कार्य की प्रतीक्षा',
  'Must share a block with a co-requisite work': 'सह-आवश्यक कार्य के साथ block साझा करना आवश्यक',
  'Machine / gang not available': 'मशीन / गैंग उपलब्ध नहीं',
  'Held in an approved block that lies after its due day': 'देय दिन के बाद वाले स्वीकृत block में रखा गया',
  'No free window long enough for the work anywhere in the horizon': 'पूरी अवधि में कार्य जितनी लंबी कोई खाली खिड़की नहीं',
  'No free window on or before its due day': 'देय दिन तक कोई खाली खिड़की नहीं',
  'Search found no cheaper on-time window (increase iterations)': 'खोज को समय पर कोई सस्ती खिड़की नहीं मिली (पुनरावृत्तियाँ बढ़ाएँ)',
  'deferred by the optimiser': 'ऑप्टिमाइज़र द्वारा स्थगित',
};

/** Engine reason text in the UI language (fixed phrases translated, anything else as given). */
export function reasonText(reason: string | null | undefined, lang: Lang): string {
  if (!reason) return '';
  if (lang !== 'hi') return reason;
  if (REASON_HI[reason]) return REASON_HI[reason];
  const m = reason.match(/^(\d+) of (\d+) on-time windows break this rule$/);
  if (m) return `समय पर की ${m[2]} में से ${m[1]} खिड़कियाँ यह नियम तोड़ती हैं`;
  return reason;
}

export const workTypeLabel = (code: unknown): string => {
  const w = (WORK_TYPES as Record<string, { label: string }>)[String(code)];
  return w ? w.label : String(code ?? '');
};

export function dayText(snapshot: Snapshot, day: number | null | undefined): string {
  if (day === null || day === undefined || !Number.isFinite(day)) return '';
  return dateLabel(addDaysIso(snapshot.planStart, day));
}

/* ── extra rows from the optimiser's hard-rule reasons ─────────── */

export type ExtraKind = 'DEP_UNSCHEDULED' | 'DEP_ORDER' | 'COREQ' | 'JPO_LIMIT' | 'PREMIUM_DAY' | 'BEYOND_DUE' | 'RESOURCE_UNAVAILABLE' | 'OTHER';

/** A conflict row shaped like select.Conflict, with the extra kinds this view adds. */
export interface ConflictRow {
  id: string;
  severity: ConflictSeverity;
  kind: Conflict['kind'] | ExtraKind;
  blockId?: string;
  taskId?: string;
  day?: number;
  params: Record<string, string | number | boolean | null>;
}

/** Hard reasons of the working plan that conflictsFor does not turn into a row. */
export function extraHardReasonRows(snapshot: Snapshot, existing: Conflict[]): ConflictRow[] {
  const plan = snapshot.result.weekly.ai;
  const out: ConflictRow[] = [];
  const seen = new Set<string>();
  const add = (r: ConflictRow) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    out.push(r);
  };
  const safetyIds = new Set(existing.filter((c) => c.kind === 'SAFETY' || c.kind === 'DEFERRED_MANDATORY').map((c) => c.taskId));
  const premiumDays = new Set(existing.filter((c) => c.kind === 'PREMIUM_PATH').map((c) => c.day));
  for (const r of plan.cost?.hardReasons ?? []) {
    let m: RegExpMatchArray | null;
    if ((m = r.match(/^(\S+) depends on (\S+), which is not scheduled/))) add({ id: `DEP_UNSCHEDULED:${m[1]}:${m[2]}`, severity: 'high', kind: 'DEP_UNSCHEDULED', taskId: m[1], params: { task: m[1], pre: m[2] } });
    else if ((m = r.match(/^(\S+) must start after (\S+) ends/))) add({ id: `DEP_ORDER:${m[1]}:${m[2]}`, severity: 'high', kind: 'DEP_ORDER', taskId: m[1], params: { task: m[1], pre: m[2] } });
    else if ((m = r.match(/^(\S+) and (\S+) must share one block/))) add({ id: `COREQ:${m[1]}:${m[2]}`, severity: 'high', kind: 'COREQ', taskId: m[1], params: { a: m[1], b: m[2] } });
    else if ((m = r.match(/block exceeds JPO (\d+) h limit on day (\d+)/))) add({ id: `JPO_LIMIT:${m[2]}`, severity: 'high', kind: 'JPO_LIMIT', day: +m[2] - 1, params: { hours: +m[1] } });
    else if ((m = r.match(/premium path conflict on day (\d+)/))) {
      if (!premiumDays.has(+m[1] - 1)) add({ id: `PREMIUM_DAY:${m[1]}`, severity: 'high', kind: 'PREMIUM_DAY', day: +m[1] - 1, params: {} });
    } else if ((m = r.match(/^mandatory task (\S+) beyond due day/))) {
      if (!safetyIds.has(m[1])) add({ id: `OTHER:${r}`, severity: 'high', kind: 'OTHER', taskId: m[1], params: { text: r } });
    } else if (/^(incompatible works|more than \d+ possessions|\d+ simultaneous possessions|mandatory task \S+ deferred|machine not available|gang not available)/.test(r)) {
      // already a row of conflictsFor (or of the resource violations)
    } else add({ id: `OTHER:${r}`, severity: 'medium', kind: 'OTHER', params: { text: r } });
  }
  return out;
}

/** Any one of the optimiser's hard-rule reasons as a row (for the safety banner, which lists them all). */
export function hardReasonRow(r: string, snapshot: Snapshot, rules: { maxConcurrentBlocks: number }): ConflictRow {
  const tasksById = new Map(snapshot.tasks.map((x) => [x.id, x]));
  let m: RegExpMatchArray | null;
  if ((m = r.match(/^incompatible works (\S+) \+ (\S+)/))) return { id: r, severity: 'high', kind: 'INCOMPATIBLE', params: { workTypeA: m[1], workTypeB: m[2], source: 'plan' } };
  if ((m = r.match(/more than (\d+) possessions on day (\d+)/))) return { id: r, severity: 'medium', kind: 'BLOCKS_PER_DAY', day: +m[2] - 1, params: { limit: +m[1], source: 'plan' } };
  if ((m = r.match(/(\d+) simultaneous possessions on day (\d+)/))) return { id: r, severity: 'high', kind: 'CONCURRENCY', day: +m[2] - 1, params: { count: +m[1], limit: rules.maxConcurrentBlocks, source: 'plan' } };
  if ((m = r.match(/^mandatory task (\S+) deferred/))) {
    const t = tasksById.get(m[1]);
    return { id: r, severity: 'high', kind: 'DEFERRED_MANDATORY', taskId: m[1], params: { label: t?.label ?? m[1], reason: 'deferred by the optimiser', section: t?.sectionLabel ?? '' } };
  }
  if ((m = r.match(/^mandatory task (\S+) beyond due day/))) return { id: r, severity: 'high', kind: 'BEYOND_DUE', taskId: m[1], params: { task: m[1] } };
  if ((m = r.match(/^(machine|gang) not available for (\S+)/))) return { id: r, severity: 'high', kind: 'RESOURCE_UNAVAILABLE', taskId: m[2], params: { task: m[2], what: m[1] } };
  if ((m = r.match(/^(\S+) depends on (\S+), which is not scheduled/))) return { id: r, severity: 'high', kind: 'DEP_UNSCHEDULED', taskId: m[1], params: { task: m[1], pre: m[2] } };
  if ((m = r.match(/^(\S+) must start after (\S+) ends/))) return { id: r, severity: 'high', kind: 'DEP_ORDER', taskId: m[1], params: { task: m[1], pre: m[2] } };
  if ((m = r.match(/^(\S+) and (\S+) must share one block/))) return { id: r, severity: 'high', kind: 'COREQ', taskId: m[1], params: { a: m[1], b: m[2] } };
  if ((m = r.match(/block exceeds JPO (\d+) h limit on day (\d+)/))) return { id: r, severity: 'high', kind: 'JPO_LIMIT', day: +m[2] - 1, params: { hours: +m[1] } };
  if ((m = r.match(/premium path conflict on day (\d+)/))) return { id: r, severity: 'high', kind: 'PREMIUM_DAY', day: +m[1] - 1, params: {} };
  return { id: r, severity: 'medium', kind: 'OTHER', params: { text: r } };
}

/* ── sentence for one row ──────────────────────────────────────── */

export function conflictSentence(c: ConflictRow, snapshot: Snapshot, lang: Lang, taskName: (id: string) => string): string {
  const t = (k: ConflictKey, v?: Record<string, string | number>) => translate(conflictStrings, lang, k, v);
  const p = c.params;
  const s = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  const win = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? `${hhmm(a)}–${hhmm(b)}` : '');
  const day = dayText(snapshot, c.day) || t('noDay');
  switch (c.kind) {
    case 'MACHINE_OVERLAP':
      return p.source === 'plan' ? t('MACHINE_PLAN', { detail: s(p.detail) }) : t('MACHINE_OVERLAP', { machine: s(p.machine), block: s(c.blockId), other: s(p.otherBlockId), window: win(p.start, p.end) });
    case 'CREW_OVERLAP':
      return p.source === 'plan' ? t('CREW_PLAN', { detail: s(p.detail) }) : t('CREW_OVERLAP', { crew: s(p.crew), block: s(c.blockId), other: s(p.otherBlockId), window: win(p.start, p.end) });
    case 'INCOMPATIBLE':
      return t('INCOMPATIBLE', { a: workTypeLabel(p.workTypeA), b: workTypeLabel(p.workTypeB) });
    case 'CONCURRENCY':
      return t('CONCURRENCY', { count: s(p.count), day, limit: s(p.limit) });
    case 'BLOCKS_PER_DAY':
      return p.count === undefined || p.count === null ? t('BLOCKS_PER_DAY_PLAN', { day, limit: s(p.limit) }) : t('BLOCKS_PER_DAY', { count: s(p.count), day, limit: s(p.limit) });
    case 'PREMIUM_PATH':
      return t('PREMIUM_PATH', { count: s(p.count), block: s(c.blockId), window: win(p.start, p.end) });
    case 'T351_PENDING':
      return t('T351_PENDING', { pending: s(p.pending), total: s(p.total), block: s(c.blockId) });
    case 'POWER_PENDING': {
      const phase = p.phase === 'isolateStarted' ? 'POWER_isolateStarted' : p.phase === 'reenergise' ? 'POWER_reenergise' : 'POWER_isolate';
      return t(phase, { block: s(c.blockId), isolation: s(p.isolation) || '—' });
    }
    case 'OBJECTION':
      return t('OBJECTION', { dept: s(p.dept), block: s(c.blockId), reason: s(p.reason), by: s(p.by) });
    case 'SAFETY': {
      const due = dayText(snapshot, Math.max(0, Number(p.dueDay ?? 0)));
      const placed = p.placedDay === null || p.placedDay === undefined ? t('SAFETY_UNPLACED') : t('SAFETY_PLACED', { placed: dayText(snapshot, Number(p.placedDay)) });
      const reason = reasonText(s(p.reason), lang);
      const detail = p.detail ? ` (${reasonText(s(p.detail), lang)})` : '';
      return `${t('SAFETY', { label: s(p.label), due, reason: `${reason}${detail}` })} ${placed}.`;
    }
    case 'DEFERRED_MANDATORY':
      return t('DEFERRED_MANDATORY', { label: s(p.label), section: s(p.section), reason: reasonText(s(p.reason), lang) });
    case 'SUPERSEDED':
      return p.status === 'GRANTED' || p.status === 'LOCKED' ? t('SUPERSEDED_HELD', { status: s(p.status).toLowerCase(), block: s(c.blockId), works: s(p.works) }) : t('SUPERSEDED', { block: s(c.blockId), works: s(p.works) });
    case 'DEP_UNSCHEDULED':
      return t('DEP_UNSCHEDULED', { task: taskName(s(p.task)), pre: taskName(s(p.pre)) });
    case 'DEP_ORDER':
      return t('DEP_ORDER', { task: taskName(s(p.task)), pre: taskName(s(p.pre)) });
    case 'COREQ':
      return t('COREQ', { a: taskName(s(p.a)), b: taskName(s(p.b)) });
    case 'JPO_LIMIT':
      return t('JPO_LIMIT', { day, hours: s(p.hours) });
    case 'PREMIUM_DAY':
      return t('PREMIUM_DAY', { day });
    case 'BEYOND_DUE':
      return t('BEYOND_DUE', { task: taskName(s(p.task)) });
    case 'RESOURCE_UNAVAILABLE':
      return t(p.what === 'gang' ? 'RESOURCE_gang' : 'RESOURCE_machine', { task: taskName(s(p.task)) });
    default:
      return t('OTHER', { text: s(p.text) });
  }
}

/* ── dependency and joint-block requirements (met or not) ─────── */

export interface Requirement {
  id: string;
  kind: 'dependsOn' | 'coRequire';
  taskId: string;
  otherId: string;
  met: boolean;
  /** when not met: 'unplaced' (one side not scheduled), 'order' or 'separate' */
  why: 'unplaced' | 'order' | 'separate' | null;
  /** the block both works share (coRequire, met) */
  blockId: string | null;
}

/**
 * Every "depends on" and "must share a block with" of the works in the
 * register, checked against the working plan: a predecessor must end before
 * the work starts (day and minute), co-requisite works must sit in one block.
 */
export function requirementChecks(snapshot: Snapshot, blocks: WorkingBlock[]): Requirement[] {
  const sched = new Map(snapshot.result.weekly.ai.scheduled.map((s) => [s.taskId, s]));
  const blockOf = (id: string) => blocks.find((b) => b.tasks.some((x) => x.id === id)) ?? null;
  const out: Requirement[] = [];
  const pairs = new Set<string>();
  for (const t of snapshot.tasks) {
    for (const pre of t.dependsOn ?? []) {
      const a = sched.get(pre);
      const b = sched.get(t.id);
      const placed = !!a && !!b;
      const ok = placed && a!.day * 1440 + a!.end <= b!.day * 1440 + b!.start;
      out.push({ id: `dep:${t.id}:${pre}`, kind: 'dependsOn', taskId: t.id, otherId: pre, met: ok, why: ok ? null : placed ? 'order' : 'unplaced', blockId: null });
    }
    for (const co of t.coRequireWith ?? []) {
      const key = [t.id, co].sort().join('|');
      if (pairs.has(key)) continue;
      pairs.add(key);
      const x = blockOf(t.id);
      const y = blockOf(co);
      const ok = !!x && !!y && x.id === y.id;
      out.push({ id: `co:${key}`, kind: 'coRequire', taskId: t.id, otherId: co, met: ok, why: ok ? null : x && y ? 'separate' : 'unplaced', blockId: ok ? x!.id : null });
    }
  }
  return out;
}
