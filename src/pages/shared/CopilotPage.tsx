/**
 * CopilotPage — plain-language questions about the current plan.
 *
 * The engine's rule-based router (askCopilot, src/engine/copilot.js) decides
 * what is being asked; the answer text is then built here from the snapshot
 * and the working blocks so that every figure is computed (the engine's own
 * text has a few fallbacks, e.g. a fixed "Day 0" placement, that are not).
 * Answers are in English. Passenger reservation (PNR) questions are out of
 * scope and are intercepted before the engine sees them.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, RotateCcw, Send } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { usePortal } from '../../app/usePortal';
import type { PortalId } from '../../auth/portals';
import { askCopilot } from '../../engine/copilot.js';
import { blockStatusLabel, workingBlocks, type WorkingBlock } from '../../engine/select';
import type { Snapshot, Task } from '../../engine/types';
import { useT } from '../../i18n';
import { addDaysIso, classLabel, dateLabel, duration, hhmm, num, pct, rupees } from '../../lib/format';
import { Card, CardBody, PageHeader, PlanPending } from '../../components/ui';
import { SimLabel, type SimKind } from '../../components/ui/extras';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

const strings = {
  en: {
    title: 'Copilot',
    lede: 'Questions about this week’s plan on {corridor}: why a work ranks where it does, what is planned on a day, which trains a block touches, TSRs in force, and the plan against the baseline.',
    clear: 'Clear conversation',
    placeholder: 'Ask about a work, a block, a day or the baseline…',
    send: 'Ask',
    you: 'You',
    copilot: 'Copilot',
    source: 'Computed from: {source}',
    note: 'Answers are in English and are built from the current plan by a rule-based router, not a language model. Passenger reservation (PNR), seat and live running data are out of scope.',
    welcome: 'Ask a question below, or pick one of the suggestions. Every answer is computed from the plan now on screen.',
    pWhy: 'Why is the top-ranked work first?',
    pTomorrow: 'What blocks are planned tomorrow?',
    pBlock: 'Which trains does block {id} affect?',
    pTsr: 'Show TSRs in force',
    pBaseline: 'Compare the plan with the baseline',
    pTop: 'Top priority works',
    pMandatory: 'Explain the mandatory safety floor',
    openTask: 'Open {id}',
    openBlock: 'Open {id}',
    openRisk: 'Risk & priority',
    openWeekly: 'Weekly plan',
    openCaution: 'Caution & TSR',
    openOverview: 'Overview',
  },
  hi: {
    title: 'कोपायलट',
    lede: '{corridor} पर इस सप्ताह की योजना के प्रश्न: कोई कार्य उस क्रम पर क्यों है, किसी दिन क्या नियोजित है, कोई ब्लॉक किन ट्रेनों को प्रभावित करता है, लागू TSR, और आधार-रेखा से तुलना।',
    clear: 'बातचीत साफ़ करें',
    placeholder: 'किसी कार्य, ब्लॉक, दिन या आधार-रेखा के बारे में पूछें (अंग्रेज़ी में)…',
    send: 'पूछें',
    you: 'आप',
    copilot: 'कोपायलट',
    source: 'स्रोत: {source}',
    note: 'उत्तर अंग्रेज़ी में हैं और नियम-आधारित राउटर वर्तमान योजना से बनाता है, कोई भाषा मॉडल नहीं। यात्री आरक्षण (PNR), सीट और लाइव रनिंग डेटा इसके दायरे से बाहर हैं।',
    welcome: 'नीचे प्रश्न पूछें या कोई सुझाव चुनें। हर उत्तर स्क्रीन पर मौजूद योजना से गणित होता है।',
    pWhy: 'सबसे ऊँचे रैंक का कार्य पहले क्यों है?',
    pTomorrow: 'कल कौन से ब्लॉक नियोजित हैं?',
    pBlock: 'ब्लॉक {id} किन ट्रेनों को प्रभावित करता है?',
    pTsr: 'लागू TSR दिखाएँ',
    pBaseline: 'योजना की आधार-रेखा से तुलना',
    pTop: 'सर्वोच्च प्राथमिकता वाले कार्य',
    pMandatory: 'अनिवार्य सुरक्षा फ़्लोर समझाएँ',
    openTask: '{id} खोलें',
    openBlock: '{id} खोलें',
    openRisk: 'जोखिम व प्राथमिकता',
    openWeekly: 'साप्ताहिक योजना',
    openCaution: 'सतर्कता व TSR',
    openOverview: 'अवलोकन',
  },
} as const;

type Key = keyof typeof strings.en;

interface EngineLink {
  type: string;
  id: string;
  text: string;
  view?: string;
}
interface EngineAnswer {
  answer: string;
  dataSource: string;
  links: EngineLink[];
}

type RouteKind = 'overview' | 'caution' | 'weekly' | 'risk';
type Action = { kind: 'task' | 'block'; id: string } | { kind: 'route'; to: RouteKind };

interface Answer {
  text: string;
  source: string;
  labels: SimKind[];
  actions: Action[];
}

interface Message {
  id: string;
  who: 'user' | 'copilot';
  text: string;
  at: string;
  answer?: Answer;
}

/** Routes each portal can open for a link kind (only the user's own portal). */
const ROUTES: Record<RouteKind, Partial<Record<PortalId, string>>> = {
  overview: { planning: '/app/planning/overview', division: '/app/division/brief', control: '/app/control/board', tms: '/app/tms/today', smms: '/app/smms/today', tdms: '/app/tdms/today' },
  caution: { control: '/app/control/caution', tms: '/app/tms/caution' },
  weekly: { planning: '/app/planning/weekly', control: '/app/control/weekly', tms: '/app/tms/blocks', smms: '/app/smms/blocks', tdms: '/app/tdms/blocks' },
  risk: { planning: '/app/planning/risk' },
};
const ROUTE_LABEL: Record<RouteKind, Key> = { overview: 'openOverview', caution: 'openCaution', weekly: 'openWeekly', risk: 'openRisk' };

const PNR_RE = /\bpnr\b|\b\d{10}\b/i;
const MANDATORY_RE = /mandatory|safety floor/i;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MODE_TEXT: Record<string, string> = { SLW: 'worked over the other line', HELD: 'held', REGULATED: 'regulated' };

const OUT_OF_SCOPE: Answer = { text: 'Passenger reservation (PNR) data is out of scope for SAMANVAY.', source: 'scope of SAMANVAY', labels: [], actions: [] };

/** Plan day (0 = first day of the plan) named in the question, if any. */
function dayFromQuery(q: string, planStart: string): number | null {
  const m = q.match(/day\s*(\d)/i);
  if (m) return Math.min(6, Math.max(0, Number(m[1])));
  if (/tomorrow/i.test(q)) return 1;
  if (/today|tonight/i.test(q)) return 0;
  const startDow = new Date(`${planStart}T00:00:00`).getDay();
  const named = WEEKDAYS.findIndex((d) => q.toLowerCase().includes(d));
  if (named >= 0) return (named - startDow + 7) % 7;
  return null;
}

function placementText(snapshot: Snapshot, task: Task): string {
  const w = snapshot.result.weekly.ai;
  const s = w.scheduled.find((x) => x.taskId === task.id);
  if (s) return `Placed on ${dateLabel(addDaysIso(snapshot.planStart, s.day))}, ${hhmm(s.start)}–${hhmm(s.end)}.`;
  const d = w.deferred.find((x) => x.taskId === task.id);
  if (d) return `Not placed this week: ${d.reason}.`;
  const r = snapshot.result.rolling.entries.find((x) => x.taskId === task.id);
  if (r) return `Capital work in the 26-week programme, ${r.weekLabel}.`;
  return 'Not in this week’s plan.';
}

/** Minimal **bold** rendering for answer text; everything else is plain. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <div key={i} style={{ minHeight: '1em' }}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part.replace(/\*([^*]+)\*/g, '$1')}</span>
          )}
        </div>
      ))}
    </>
  );
}

const clock = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
/** Unique id for a question/answer pair (called from the submit handler only). */
const messageStamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export default function CopilotPage() {
  const t = useT(strings);
  const nav = useNavigate();
  const portal = usePortal();
  const drawer = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const approvals = useAppStore((s) => s.approvals);
  const tsrs = useAppStore((s) => s.tsrs);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const firstBlockWithTrains = useMemo(() => blocks.find((b) => b.affectedTrains.length > 0) ?? blocks[0] ?? null, [blocks]);

  if (!snapshot) return <PlanPending />;

  const k = snapshot.result.weekly.kpis;
  const b = snapshot.result.weekly.baseKpis;
  const d = snapshot.result.weekly.delta;
  const dayDate = (day: number) => dateLabel(addDaysIso(snapshot.planStart, day));
  const routeFor = (to: RouteKind) => ROUTES[to][portal] ?? null;

  /* ── answer builders (every figure from the snapshot) ───────── */
  const whyAnswer = (task: Task): Answer => {
    const r = task.risk;
    const terms = r.explanation.map((e) => `• **${e.label}** (${e.value.toFixed(2)}${e.weight !== null ? `, weight ${e.weight.toFixed(2)}` : ''}): ${e.text}`).join('\n');
    return {
      text: `**${task.label}** (${task.id}) on **${task.sectionLabel}**, ${task.line} line — ARCI **${r.arci.toFixed(2)}**, ${r.urgencyLabel}${r.mandatory ? ', mandatory' : ''}.\n\n**Why this rank:**\n${terms}\n\n${placementText(snapshot, task)}`,
      source: 'ARCI risk engine (Weibull fits and escalation model)',
      labels: ['model'],
      actions: [{ kind: 'task', id: task.id }, { kind: 'route', to: 'risk' }],
    };
  };

  const dayAnswer = (day: number): Answer => {
    const list = blocks.filter((x) => x.day === day && x.status !== 'REFUSED').sort((x, y) => x.start - y.start);
    if (!list.length) return { text: `No possessions are planned on **${dayDate(day)}**.`, source: 'weekly plan', labels: ['solver'], actions: [{ kind: 'route', to: 'weekly' }] };
    const lines = list.map((x: WorkingBlock) => `• **${x.id}** ${x.startText}–${x.endText} (${duration(x.spanMin)}) · ${x.sectionText} ${x.line} · ${x.departments.join(' + ')} · ${blockStatusLabel(x)}`).join('\n');
    return {
      text: `**${list.length} possession${list.length === 1 ? '' : 's'}** planned on **${dayDate(day)}**:\n\n${lines}`,
      source: 'weekly plan with Control decisions',
      labels: ['solver'],
      actions: [...list.slice(0, 3).map((x): Action => ({ kind: 'block', id: x.id })), { kind: 'route', to: 'weekly' }],
    };
  };

  const blockAnswer = (block: WorkingBlock): Answer => {
    const head = `Block **${block.id}** — ${block.sectionText} ${block.line}, ${dayDate(block.day)} ${block.startText}–${block.endText}`;
    if (!block.affectedTrains.length) return { text: `${head}.\n\nIt fits a timetable gap: no train is held, regulated or worked over the other line.`, source: 'delay model over the working timetable', labels: ['planningEstimate'], actions: [{ kind: 'block', id: block.id }] };
    const lines = block.affectedTrains.map((x) => `• **${x.number}** ${x.name} (${classLabel(x.cls)}): ${MODE_TEXT[x.mode] ?? x.mode}, ${x.delayMin} min`).join('\n');
    return {
      text: `${head} — **${block.affectedTrains.length} train${block.affectedTrains.length === 1 ? '' : 's'}**:\n\n${lines}\n\nClass-weighted delay: **${num(block.weightedDelayMin)} train-minutes**${block.overridden ? ' (computed for the optimiser window; Control changed the window)' : ''}.`,
      source: 'delay model over the working timetable',
      labels: ['planningEstimate'],
      actions: [{ kind: 'block', id: block.id }],
    };
  };

  const tsrAnswer = (): Answer => {
    const registered = snapshot.tasks.filter((x) => x.tsrKmph);
    const manual = tsrs.filter((x) => x.corridorId === snapshot.corridor.id && x.status === 'IN_FORCE');
    if (!registered.length && !manual.length) return { text: 'No TSR is in force on this corridor in the registers or the TSR register.', source: 'TMS / SMMS / TDMS registers and the TSR register', labels: ['seededFeed'], actions: [] };
    const reg = registered.map((x) => `• **${x.id}** ${x.tsrKmph} km/h on ${x.sectionLabel} ${x.line} — ${x.label}${x.tsrSinceDays ? `, in force ${x.tsrSinceDays} d` : ''}`).join('\n');
    const man = manual.map((x) => `• **${x.id}** ${x.kmph} km/h, km ${x.fromKm}–${x.toKm} ${x.line} — ${x.reason}`).join('\n');
    return {
      text: `${registered.length ? `**${registered.length} TSR${registered.length === 1 ? '' : 's'} from the registers:**\n${reg}\n\n` : ''}${manual.length ? `**${manual.length} TSR${manual.length === 1 ? '' : 's'} imposed in the TSR register:**\n${man}\n\n` : ''}Train-minutes lost to register TSRs this week under the plan: **${num(k.tsrTrainMinutes)}** (baseline ${num(b.tsrTrainMinutes)}).`,
      source: 'TMS / SMMS / TDMS registers and the TSR register',
      labels: ['seededFeed'],
      actions: [{ kind: 'route', to: 'caution' }],
    };
  };

  const baselineAnswer = (): Answer => ({
    text:
      `**Plan against the simulated decentralised baseline (same seed):**\n\n` +
      `• Possessions: **${k.blockCount}** vs ${b.blockCount}\n` +
      `• Possession hours: **${num(k.totalBlockHours, 1)}** vs ${num(b.totalBlockHours, 1)}\n` +
      `• Section-line hours closed: **${num(k.sectionLineHoursLost, 1)}** vs ${num(b.sectionLineHoursLost, 1)} (${num(d.sectionLineHoursSaved, 1)} returned to traffic)\n` +
      `• Corridor availability: **${pct(k.availability, 2)}** vs ${pct(b.availability, 2)}\n` +
      `• Co-location of closure works: **${pct(k.colocationRate, 1)}** vs ${pct(b.colocationRate, 1)}\n` +
      `• Mandatory works in time: **${k.mandatoryCompliant} of ${k.mandatoryTotal}** vs ${b.mandatoryCompliant} of ${b.mandatoryTotal}\n` +
      `• Class-weighted train delay: **${num(k.weightedDelayMin)}** vs ${num(b.weightedDelayMin)} train-minutes\n` +
      `• Estimated value this week: **${rupees(d.estRupeesSaved)}** (unit rates are assumptions)`,
    source: 'KPI engine, like-for-like against the baseline',
    labels: ['baseline', 'assumption'],
    actions: [{ kind: 'route', to: 'overview' }],
  });

  const mandatoryAnswer = (): Answer => {
    const list = snapshot.tasks.filter((x) => x.risk.mandatory).sort((x, y) => y.risk.arci - x.risk.arci);
    const lines = list.slice(0, 6).map((x) => `• **${x.id}** ${x.label} on ${x.sectionLabel} ${x.line} — ${placementText(snapshot, x)}`).join('\n');
    return {
      text: `The risk engine marks a work mandatory when its safety severity is at the top of the scale and it is due, or a TSR is already in force. Its ARCI is raised to the mandatory floor and the optimiser places it before any other work, whatever the cost.\n\nThis run: **${k.mandatoryTotal}** mandatory works, **${k.mandatoryCompliant}** placed by their due day (baseline ${b.mandatoryCompliant}).${lines ? `\n\n${lines}` : ''}`,
      source: 'ARCI risk engine and weekly plan',
      labels: ['model', 'solver'],
      actions: [...list.slice(0, 3).map((x): Action => ({ kind: 'task', id: x.id })), { kind: 'route', to: 'risk' }],
    };
  };

  const helpAnswer = (): Answer => ({
    text: `I did not match that to a plan query. Try one of these:\n• "Why is task ${snapshot.tasks[0]?.id ?? ''} ranked where it is?"\n• "What blocks are planned on Thursday?"\n• "Which trains does block ${firstBlockWithTrains?.id ?? ''} affect?"\n• "Show TSRs in force"\n• "Compare the plan with the baseline"\n• "Top priority works"`,
    source: 'question router',
    labels: [],
    actions: [],
  });

  const respond = (q: string): Answer => {
    if (PNR_RE.test(q)) return OUT_OF_SCOPE;
    if (MANDATORY_RE.test(q)) return mandatoryAnswer();
    const day = dayFromQuery(q, snapshot.planStart);
    // the engine router only knows "day N", "today" and "tomorrow"; weekday names are resolved here
    const routed = day !== null && !/\bwhy\b/i.test(q) && /block|possession|planned|scheduled/i.test(q) ? `blocks day ${day}` : q;
    const r = askCopilot(routed, snapshot) as EngineAnswer;
    const src = r.dataSource;
    if (/PNR/i.test(src)) return OUT_OF_SCOPE;
    if (src.startsWith('ARCI Risk Engine')) {
      const task = snapshot.tasks.find((x) => x.id === r.links[0]?.id);
      return task ? whyAnswer(task) : helpAnswer();
    }
    if (src.startsWith('Weekly Block Plan')) return dayAnswer(day ?? 0);
    if (src.startsWith('Delay Model') || src.startsWith('Occupancy Model')) {
      const block = blocks.find((x) => x.id === r.links[0]?.id);
      return block ? blockAnswer(block) : helpAnswer();
    }
    if (src.startsWith('TMS / Caution')) return tsrAnswer();
    if (src.startsWith('KPI Engine')) return baselineAnswer();
    if (src.startsWith('ARCI Prioritisation')) {
      return { text: r.answer, source: 'ARCI ranking of the task register', labels: ['model'], actions: [...r.links.filter((l) => l.type === 'task').map((l): Action => ({ kind: 'task', id: l.id })), { kind: 'route', to: 'risk' }] };
    }
    return helpAnswer();
  };

  const ask = (q: string) => {
    const query = q.trim();
    if (!query) return;
    const at = clock();
    const stamp = messageStamp();
    setMessages((prev) => [...prev, { id: `u-${stamp}`, who: 'user', text: query, at }, { id: `c-${stamp}`, who: 'copilot', text: '', at, answer: respond(query) }]);
    setInput('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  const presets: { label: string; query: string }[] = [
    { label: t('pWhy'), query: 'Why is the top-ranked work first?' },
    { label: t('pTomorrow'), query: 'What blocks are planned tomorrow?' },
    ...(firstBlockWithTrains ? [{ label: t('pBlock', { id: firstBlockWithTrains.id }), query: `Which trains are affected by block ${firstBlockWithTrains.id}?` }] : []),
    { label: t('pTsr'), query: 'Show TSRs in force' },
    { label: t('pBaseline'), query: 'Compare the plan with the baseline' },
    { label: t('pTop'), query: 'Top priority works' },
    { label: t('pMandatory'), query: 'Explain the mandatory safety floor' },
  ];

  const renderAction = (a: Action, i: number) => {
    if (a.kind === 'route') {
      const to = routeFor(a.to);
      if (!to) return null;
      return (
        <button key={i} type="button" className="btn btn-sm btn-ghost" onClick={() => nav(to)}>
          <ExternalLink /> {t(ROUTE_LABEL[a.to])}
        </button>
      );
    }
    const other = a.kind === 'task' ? 'block' : 'task';
    return (
      <button key={i} type="button" className="btn btn-sm" onClick={() => drawer.open(a.kind, a.id, { close: other })}>
        {t(a.kind === 'task' ? 'openTask' : 'openBlock', { id: a.id })}
      </button>
    );
  };

  return (
    <div className="stack-lg" style={{ maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <PageHeader
        title={t('title')}
        lede={t('lede', { corridor: snapshot.corridor.name })}
        actions={
          <button type="button" className="btn btn-sm" onClick={() => setMessages([])} disabled={!messages.length}>
            <RotateCcw /> {t('clear')}
          </button>
        }
      />

      <div className="row-wrap">
        {presets.map((p) => (
          <button key={p.query} type="button" className="btn btn-sm" onClick={() => ask(p.query)}>
            {p.label}
          </button>
        ))}
      </div>

      <Card>
        <CardBody>
          <div className="stack" style={{ gap: 14, minHeight: 280, maxHeight: '60vh', overflowY: 'auto' }} aria-live="polite">
            {!messages.length && <div className="well small muted">{t('welcome')}</div>}
            {messages.map((m) =>
              m.who === 'user' ? (
                <div key={m.id} className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                  <span className="tiny muted">
                    {t('you')} · {m.at}
                  </span>
                  <div className="small" style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--pastel-blue)', color: 'var(--on-blue)', border: '1px solid var(--line)', overflowWrap: 'anywhere' }}>
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="stack" style={{ alignItems: 'flex-start', gap: 4 }}>
                  <span className="tiny muted">
                    <b>{t('copilot')}</b> · {m.at}
                  </span>
                  {m.answer && (
                    <div className="well small" style={{ maxWidth: '92%', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                      <Rich text={m.answer.text} />
                      {m.answer.actions.length > 0 && <div className="row-wrap mt">{m.answer.actions.map(renderAction)}</div>}
                    </div>
                  )}
                  {m.answer && (
                    <div className="row-wrap tiny muted">
                      <span>{t('source', { source: m.answer.source })}</span>
                      {m.answer.labels.map((kind) => (
                        <SimLabel key={kind} kind={kind} system={kind === 'seededFeed' ? 'TMS / SMMS / TDMS' : undefined} seed={kind === 'seededFeed' ? 26027 : undefined} source={kind === 'assumption' ? 'KPI unit rates' : undefined} short />
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          <form onSubmit={onSubmit} className="mt-lg">
            <div className="row">
              <input
                type="text"
                className="input grow"
                placeholder={t('placeholder')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label={t('placeholder')}
                data-tour="copilot-input"
              />
              <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
                <Send /> {t('send')}
              </button>
            </div>
            <div className="tiny muted mt">{t('note')}</div>
          </form>
        </CardBody>
      </Card>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} mode={portal === 'planning' ? 'full' : 'readOnly'} />
      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
    </div>
  );
}
