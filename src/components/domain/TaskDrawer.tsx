/**
 * TaskDrawer — one work item from the register, top to bottom:
 * header (source, department, urgency, ARCI) → where it sits on the network
 * graph → why the engine scored it → the native record it came from →
 * what the plan decided → actions the signed-in role may take.
 * Every number is read from the snapshot or the store; nothing is typed in.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, Copy, ExternalLink, FilePlus2, Pin, PinOff, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { placement, workingBlocks, blockStatusLabel } from '../../engine/select';
import { MACHINE_TYPES, CREW_TYPES } from '../../engine/constants.js';
import type { BlockKind, Task } from '../../engine/types';
import { can } from '../../auth/portals';
import { usePortal } from '../../app/usePortal';
import { useT } from '../../i18n';
import { ArciBar, Badge, Callout, DeptBadge, Drawer, KeyValue, Meter, SectionTitle, UrgencyBadge } from '../ui';
import { SimLabel } from '../ui/extras';
import { arciTone, copyText, dateLabel, duration, kmRange, lineLabel, num, pct } from '../../lib/format';
import { useDrawerParams } from './useDrawerParams';

const strings = {
  en: {
    details: 'Work details',
    mandatory: 'Mandatory',
    tsr: 'TSR {kmph} km/h',
    capital: 'Capital work',
    injected: 'Injected this run',
    pinned: 'Pinned to next run',
    closed: 'Closed for next run',
    closedBody: 'Marked attended — the engine drops this work on the next run.',
    reopen: 'Reopen for next run',
    reopened: 'Work reopened',
    reopenedBody: '{id} returns to the register on the next run.',
    // location
    location: 'Location on the network graph',
    nativeLocation: 'Native record location',
    blockSection: 'Block section',
    oheSections: 'OHE elementary sections',
    blockKind: 'Block kind',
    noClosure: 'no line closure',
    kindTraffic: 'Traffic block',
    kindPower: 'Power block',
    kindTrafficPower: 'Traffic + power block',
    kindDisconnection: 'S&T disconnection',
    durationLabel: 'Duration',
    durationParts: '{setup} setup + {work} work + {clear} clearance = {total}',
    calibrated: 'Calibrated from {base} min by the execution log ({samples} records, mean ratio {ratio})',
    calibratedNoSample: 'Calibrated from {base} min by the execution log',
    machine: 'Machine',
    noMachine: 'No machine — manual gang work',
    crew: 'Crew',
    due: 'Due',
    overdueBy: '{days} d overdue against the {rule} d rule',
    dueToday: 'Due today ({rule} d rule)',
    dueIn: 'Due in {days} d ({rule} d rule)',
    // why
    why: 'Why this ARCI score',
    weight: 'weight',
    formula: 'ARCI = √S_safe × (0.30·P_f + 0.25·ODI + 0.25·O_due + 0.20·E_ml){uplift} = {arci}',
    upliftText: ' + 0.10 TSR uplift',
    floorApplied: 'Mandatory floor applied: safety severity {safety} with the work due or a TSR in force floors ARCI at 0.92, so it is scheduled first regardless of cost.',
    floorNotApplied: 'Mandatory floor (0.92) not applied: it needs safety severity ≥ 0.95 with the work due or a TSR in force. This work has severity {safety}.',
    model: 'Escalation model',
    modelBody: 'P(escalation to a stricter TSR within 30 d) = {p}. Bars are standardised feature × weight; red raises the probability, green lowers it.',
    fDaysOverdue: 'Days overdue',
    fConditionIndex: 'Condition index',
    fGmtLoad: 'GMT load',
    fAgeRatio: 'Age ÷ Weibull η',
    fSafety: 'Safety severity',
    fHasTsr: 'TSR in force',
    // native
    native: 'Native record',
    nativeEmpty: 'The source record carries no scalar fields.',
    // plan
    plan: 'Plan decision',
    scheduledIn: 'Scheduled block',
    blockId: 'Block',
    date: 'Date',
    window: 'Window',
    section: 'Section',
    sharedWith: 'Shared with',
    sharedNone: 'No other department',
    sharedTasks: '{n} other works in this block',
    status: 'Status',
    openBlock: 'Open block',
    deferred: 'Deferred this week',
    rolling: 'Rolling programme',
    rollingWeek: 'Placed in {week} ({start} – {end})',
    notPlaced: 'Not placed in the 7-day plan and not in the 26-week programme.',
    // actions
    pin: 'Pin to next run',
    unpin: 'Unpin',
    pinHint: 'Raises this work to the mandatory floor on the next run',
    pinned_t: 'Pinned to the mandatory floor',
    pinnedBody: '{id} is scheduled first on the next run. Re-plan to apply.',
    unpinned_t: 'Unpinned',
    unpinnedBody: '{id} returns to its computed ARCI on the next run.',
    raise: 'Raise requisition',
    raiseHint: 'Opens a BDMS-style block demand for this asset',
    attended: 'Mark attended',
    attendedHint: 'Needs a completed possession record that contains this work',
    attendedDone_t: 'Work attended and closed',
    attendedDoneBody: '{id} is dropped from the register; re-planning.',
    copyId: 'Copy id',
    copied: 'Copied {id}',
    copyFailed: 'Could not copy — select the id manually',
    noPermission: 'Your role cannot do this',
    notFound: 'No work with id {id} in this plan.',
  },
  hi: {
    details: 'कार्य विवरण',
    mandatory: 'अनिवार्य',
    tsr: 'TSR {kmph} km/h',
    capital: 'पूँजीगत कार्य',
    injected: 'इस रन में जोड़ा गया',
    pinned: 'अगले रन के लिए पिन',
    closed: 'अगले रन के लिए बंद',
    closedBody: 'निपटाया गया — अगले रन में इंजन इस कार्य को हटा देगा।',
    reopen: 'अगले रन के लिए पुनः खोलें',
    reopened: 'कार्य पुनः खोला गया',
    reopenedBody: '{id} अगले रन में रजिस्टर में लौटेगा।',
    location: 'नेटवर्क ग्राफ़ पर स्थान',
    nativeLocation: 'मूल रिकॉर्ड स्थान',
    blockSection: 'ब्लॉक सेक्शन',
    oheSections: 'OHE एलिमेंटरी सेक्शन',
    blockKind: 'ब्लॉक प्रकार',
    noClosure: 'लाइन बंद नहीं',
    kindTraffic: 'ट्रैफ़िक ब्लॉक',
    kindPower: 'पावर ब्लॉक',
    kindTrafficPower: 'ट्रैफ़िक + पावर ब्लॉक',
    kindDisconnection: 'S&T डिस्कनेक्शन',
    durationLabel: 'अवधि',
    durationParts: '{setup} सेटअप + {work} कार्य + {clear} क्लियरेंस = {total}',
    calibrated: 'निष्पादन लॉग से {base} मिनट से कैलिब्रेट ({samples} रिकॉर्ड, औसत अनुपात {ratio})',
    calibratedNoSample: 'निष्पादन लॉग से {base} मिनट से कैलिब्रेट',
    machine: 'मशीन',
    noMachine: 'मशीन नहीं — गैंग द्वारा हस्त कार्य',
    crew: 'गैंग',
    due: 'देय',
    overdueBy: '{rule} दिन नियम से {days} दिन विलंबित',
    dueToday: 'आज देय ({rule} दिन नियम)',
    dueIn: '{days} दिन में देय ({rule} दिन नियम)',
    why: 'यह ARCI स्कोर क्यों',
    weight: 'भार',
    formula: 'ARCI = √S_safe × (0.30·P_f + 0.25·ODI + 0.25·O_due + 0.20·E_ml){uplift} = {arci}',
    upliftText: ' + 0.10 TSR उठान',
    floorApplied: 'अनिवार्य फ़्लोर लागू: सुरक्षा गंभीरता {safety} और कार्य देय या TSR लागू होने पर ARCI 0.92 पर फ़्लोर होता है, इसलिए लागत की परवाह किए बिना पहले शेड्यूल होता है।',
    floorNotApplied: 'अनिवार्य फ़्लोर (0.92) लागू नहीं: इसके लिए सुरक्षा गंभीरता ≥ 0.95 और कार्य देय या TSR लागू होना चाहिए। इस कार्य की गंभीरता {safety} है।',
    model: 'एस्केलेशन मॉडल',
    modelBody: 'P(30 दिन में कड़े TSR तक एस्केलेशन) = {p}। बार मानकीकृत फ़ीचर × भार हैं; लाल संभावना बढ़ाता है, हरा घटाता है।',
    fDaysOverdue: 'विलंब दिन',
    fConditionIndex: 'स्थिति सूचकांक',
    fGmtLoad: 'GMT लोड',
    fAgeRatio: 'आयु ÷ Weibull η',
    fSafety: 'सुरक्षा गंभीरता',
    fHasTsr: 'TSR लागू',
    native: 'मूल रिकॉर्ड',
    nativeEmpty: 'स्रोत रिकॉर्ड में कोई स्केलर फ़ील्ड नहीं है।',
    plan: 'योजना निर्णय',
    scheduledIn: 'शेड्यूल ब्लॉक',
    blockId: 'ब्लॉक',
    date: 'तिथि',
    window: 'समय-खिड़की',
    section: 'सेक्शन',
    sharedWith: 'साझा',
    sharedNone: 'कोई अन्य विभाग नहीं',
    sharedTasks: 'इस ब्लॉक में {n} अन्य कार्य',
    status: 'स्थिति',
    openBlock: 'ब्लॉक खोलें',
    deferred: 'इस सप्ताह स्थगित',
    rolling: 'रोलिंग कार्यक्रम',
    rollingWeek: '{week} में रखा गया ({start} – {end})',
    notPlaced: '7-दिवसीय योजना में नहीं और 26-सप्ताह कार्यक्रम में भी नहीं।',
    pin: 'अगले रन के लिए पिन करें',
    unpin: 'अनपिन',
    pinHint: 'अगले रन में इस कार्य को अनिवार्य फ़्लोर तक उठाता है',
    pinned_t: 'अनिवार्य फ़्लोर पर पिन',
    pinnedBody: '{id} अगले रन में पहले शेड्यूल होगा। लागू करने के लिए पुनः योजना बनाएँ।',
    unpinned_t: 'अनपिन किया',
    unpinnedBody: '{id} अगले रन में अपने गणित ARCI पर लौटेगा।',
    raise: 'माँग दर्ज करें',
    raiseHint: 'इस परिसंपत्ति के लिए BDMS-शैली ब्लॉक माँग खोलता है',
    attended: 'निपटाया चिह्नित करें',
    attendedHint: 'इस कार्य वाला पूर्ण पज़ेशन रिकॉर्ड आवश्यक है',
    attendedDone_t: 'कार्य निपटाया और बंद',
    attendedDoneBody: '{id} रजिस्टर से हटाया गया; पुनः योजना बन रही है।',
    copyId: 'आईडी कॉपी',
    copied: '{id} कॉपी हुआ',
    copyFailed: 'कॉपी नहीं हो सका — आईडी स्वयं चुनें',
    noPermission: 'आपकी भूमिका यह नहीं कर सकती',
    notFound: 'इस योजना में {id} आईडी का कोई कार्य नहीं।',
  },
} as const;

type Strings = keyof typeof strings.en;

const KIND_KEY: Record<BlockKind, Strings> = { TRAFFIC: 'kindTraffic', POWER: 'kindPower', TRAFFIC_POWER: 'kindTrafficPower', DISCONNECTION: 'kindDisconnection' };
const FEATURE_KEY: Record<string, Strings> = { daysOverdue: 'fDaysOverdue', conditionIndex: 'fConditionIndex', gmtLoad: 'fGmtLoad', ageRatio: 'fAgeRatio', safety: 'fSafety', hasTsr: 'fHasTsr' };

const ACRONYMS = new Set(['id', 'km', 'gmt', 'tgi', 'usfd', 'ohe', 'tsr', 'atd', 'imr', 'obs', 'no', 'kmph']);

/** tmsId → "TMS id", failures12m → "Failures 12m" */
function humanKey(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .split(' ')
    .map((w, i) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase()))
    .join(' ');
}

function scalarFields(metrics: Record<string, unknown>, max = 14): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(metrics)) {
    if (out.length >= max) break;
    if (typeof v === 'number') out.push([humanKey(k), Number.isInteger(v) ? num(v) : num(v, 2)]);
    else if (typeof v === 'string' && v.trim() !== '') out.push([humanKey(k), v]);
    else if (typeof v === 'boolean') out.push([humanKey(k), v ? 'Yes' : 'No']);
  }
  return out;
}

const MACHINES = MACHINE_TYPES as Record<string, { label: string }>;
const CREWS = CREW_TYPES as Record<string, { label: string }>;

export type TaskDrawerMode = 'full' | 'readOnly';

export function TaskDrawer({ taskId, onClose, mode = 'full' }: { taskId: string | null; onClose: () => void; mode?: TaskDrawerMode }) {
  const t = useT(strings);
  const nav = useNavigate();
  const portal = usePortal();
  const { open } = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const approvals = useAppStore((s) => s.approvals);
  const user = useAppStore((s) => s.user);
  const pinnedTaskIds = useAppStore((s) => s.pinnedTaskIds);
  const excludedTaskIds = useAppStore((s) => s.excludedTaskIds);
  const executionLog = useAppStore((s) => s.executionLog);
  const pinTask = useAppStore((s) => s.pinTask);
  const unpinTask = useAppStore((s) => s.unpinTask);
  const excludeTask = useAppStore((s) => s.excludeTask);
  const includeTask = useAppStore((s) => s.includeTask);
  const runPlan = useAppStore((s) => s.runPlan);
  const toast = useAppStore((s) => s.toast);

  const task: Task | null = useMemo(() => (taskId && snapshot ? snapshot.tasks.find((x) => x.id === taskId) ?? null : null), [snapshot, taskId]);
  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const place = useMemo(() => (snapshot && task ? placement(snapshot, blocks, task.id) : null), [snapshot, blocks, task]);
  const rollingEntry = useMemo(() => (snapshot && task ? snapshot.result.rolling.entries.find((e) => e.taskId === task.id) ?? null : null), [snapshot, task]);
  const nativeRows = useMemo(() => (task ? scalarFields(task.metrics) : []), [task]);

  if (!taskId) return null;

  if (!snapshot || !task) {
    return (
      <Drawer open onClose={onClose} title={taskId} subtitle={t('details')}>
        <Callout tone="warn">{t('notFound', { id: taskId })}</Callout>
      </Drawer>
    );
  }

  const corridor = snapshot.corridor;
  const isPinned = pinnedTaskIds.includes(task.id);
  const isExcluded = excludedTaskIds.includes(task.id);
  const factor = snapshot.factors[task.workType];
  const calibrated = task.durationMin !== task.baseDurationMin;
  const oheLabels = task.oheSections.map((i) => corridor.oheSections[i]?.label).filter(Boolean);
  const isDeptPortal = portal === 'tms' || portal === 'smms' || portal === 'tdms';
  const canPlan = can(user, 'plan');
  const canAttend = can(user, 'intake') || can(user, 'execute');
  const attendedRecord = executionLog.find((r) => (r.status === 'COMPLETED' || r.status === 'CLOSED') && r.items.some((i) => i.taskId === task.id)) ?? null;
  const interactive = mode === 'full';

  const dueText =
    task.daysOverdue > 0
      ? t('overdueBy', { days: task.daysOverdue, rule: task.mandatoryWithinDays })
      : task.daysOverdue === 0
        ? t('dueToday', { rule: task.mandatoryWithinDays })
        : t('dueIn', { days: -task.daysOverdue, rule: task.mandatoryWithinDays });

  const maxContribution = Math.max(0.01, ...task.risk.mlContributions.map((c) => Math.abs(c.contribution)));

  const onPin = () => {
    if (isPinned) {
      unpinTask(task.id);
      toast({ title: t('unpinned_t'), body: t('unpinnedBody', { id: task.id }), tone: 'info' });
    } else {
      pinTask(task.id);
      toast({ title: t('pinned_t'), body: t('pinnedBody', { id: task.id }), tone: 'ok' });
    }
  };
  const onRaise = () => {
    onClose();
    nav(`/app/${portal}/register?asset=${encodeURIComponent(task.sourceId)}`);
  };
  const onAttended = () => {
    excludeTask(task.id, 'Attended and closed');
    void runPlan({ reason: `${task.id} attended and closed` });
    toast({ title: t('attendedDone_t'), body: t('attendedDoneBody', { id: task.id }), tone: 'ok' });
  };
  const onReopen = () => {
    includeTask(task.id);
    void runPlan({ reason: `${task.id} reopened` });
    toast({ title: t('reopened'), body: t('reopenedBody', { id: task.id }), tone: 'info' });
  };
  const onCopy = async () => {
    const ok = await copyText(task.id);
    toast({ title: ok ? t('copied', { id: task.id }) : t('copyFailed'), tone: ok ? 'ok' : 'warn' });
  };

  const badges = (
    <>
      <DeptBadge dept={task.dept} />
      <UrgencyBadge urgency={task.risk.urgency} />
      {task.risk.mandatory && <Badge tone="crit">{t('mandatory')}</Badge>}
      {task.tsrKmph && <Badge tone="warn">{t('tsr', { kmph: task.tsrKmph })}</Badge>}
      {task.capital && <Badge tone="lavender">{t('capital')}</Badge>}
      {task.injected && <Badge tone="info">{t('injected')}</Badge>}
      {isPinned && <Badge tone="outline" icon={<Pin size={10} />}>{t('pinned')}</Badge>}
      <ArciBar value={task.risk.arci} mandatory={task.risk.mandatory} />
    </>
  );

  const footer = interactive ? (
    <>
      {canPlan && (
        <button className="btn btn-sm" onClick={onPin} title={t('pinHint')} data-tour="task-pin">
          {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          {isPinned ? t('unpin') : t('pin')}
        </button>
      )}
      {isDeptPortal && (
        <button className="btn btn-sm btn-primary" onClick={onRaise} title={t('raiseHint')} data-tour="task-raise">
          <FilePlus2 size={14} />
          {t('raise')}
        </button>
      )}
      {canAttend && !isExcluded && (
        <button className="btn btn-sm btn-ok" onClick={onAttended} disabled={!attendedRecord} title={attendedRecord ? `${attendedRecord.blockId} · ${dateLabel(attendedRecord.date)}` : t('attendedHint')} data-tour="task-attended">
          <CheckCheck size={14} />
          {t('attended')}
        </button>
      )}
      <button className="btn btn-sm btn-ghost right" onClick={() => void onCopy()} data-tour="task-copy">
        <Copy size={14} />
        {t('copyId')}
      </button>
    </>
  ) : (
    <button className="btn btn-sm btn-ghost" onClick={() => void onCopy()} data-tour="task-copy">
      <Copy size={14} />
      {t('copyId')}
    </button>
  );

  return (
    <Drawer open onClose={onClose} title={task.label} subtitle={`${task.source} · ${task.sourceId}`} badges={badges} footer={footer}>
      <div data-tour="task-drawer" className="stack-lg">
        {isExcluded && (
          <Callout tone="warn">
            <b>{t('closed')}</b> {t('closedBody')}
            {interactive && (canPlan || canAttend) && (
              <div className="mt">
                <button className="btn btn-sm" onClick={onReopen}>
                  <RotateCcw size={14} />
                  {t('reopen')}
                </button>
              </div>
            )}
          </Callout>
        )}

        {/* ── Location ── */}
        <section data-tour="task-location">
          <SectionTitle>{t('location')}</SectionTitle>
          <KeyValue
            items={[
              [t('nativeLocation'), <span className="mono">{task.nativeLocation}</span>],
              [
                t('blockSection'),
                <>
                  <span className="strong">{task.sectionLabel}</span> · {lineLabel(task.line)} · <span className="num">{kmRange(task.startKm, task.endKm)}</span>
                </>,
              ],
              ...(oheLabels.length ? ([[t('oheSections'), oheLabels.join(', ')]] as [string, string][]) : []),
              [
                t('blockKind'),
                <>
                  {t(KIND_KEY[task.blockKind])}
                  {task.closure === 'NONE' && <span className="muted"> · {t('noClosure')}</span>}
                </>,
              ],
              [
                t('durationLabel'),
                <>
                  <span className="num">{t('durationParts', { setup: task.setupMin, work: task.durationMin, clear: task.clearanceMin, total: duration(task.totalMin) })}</span>
                  {calibrated && (
                    <div className="small muted mt">
                      {factor && factor.samples > 0 ? t('calibrated', { base: task.baseDurationMin, samples: factor.samples, ratio: factor.meanRatio.toFixed(2) }) : t('calibratedNoSample', { base: task.baseDurationMin })}
                    </div>
                  )}
                </>,
              ],
              [t('machine'), task.machine ? MACHINES[task.machine]?.label ?? task.machine : <span className="muted">{t('noMachine')}</span>],
              [t('crew'), CREWS[task.crew]?.label ?? task.crew],
              [t('due'), <span className={task.daysOverdue > 0 ? 'strong' : ''} style={task.daysOverdue > 0 ? { color: 'var(--crit)' } : undefined}>{dueText}</span>],
            ]}
          />
        </section>

        {/* ── Why this score ── */}
        <section data-tour="task-why">
          <SectionTitle>{t('why')}</SectionTitle>
          <div className="stack">
            {task.risk.explanation.map((e) => (
              <div key={e.key}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="grow small strong">{e.label}</span>
                  {e.weight !== null && <span className="tiny muted num">{t('weight')} {e.weight.toFixed(2)}</span>}
                  <span className="num small" style={{ minWidth: 40, textAlign: 'right' }}>{e.value.toFixed(2)}</span>
                </div>
                <Meter value={e.value} tone={e.weight === null ? 'info' : arciTone(e.value)} style={{ marginTop: 4 }} />
                <div className="small muted">{e.text}</div>
              </div>
            ))}
            <div className="mono small" style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
              {t('formula', { uplift: task.risk.tsrUplift ? t('upliftText') : '', arci: task.risk.arci.toFixed(2) })}
            </div>
            <div className="small muted">{task.risk.mandatory ? t('floorApplied', { safety: task.safety.toFixed(2) }) : t('floorNotApplied', { safety: task.safety.toFixed(2) })}</div>
          </div>

          {task.risk.mlContributions.length > 0 && (
            <div className="mt-lg">
              <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                <span className="small strong grow">{t('model')}</span>
                <SimLabel kind="model" />
              </div>
              <div className="small muted" style={{ marginBottom: 8 }}>{t('modelBody', { p: pct(task.risk.escalation) })}</div>
              <div className="stack">
                {task.risk.mlContributions.map((c) => (
                  <div key={c.key} className="row" style={{ gap: 8 }}>
                    <span className="small" style={{ flex: '0 0 38%' }}>{FEATURE_KEY[c.key] ? t(FEATURE_KEY[c.key]) : humanKey(c.key)}</span>
                    <Meter value={Math.abs(c.contribution) / maxContribution} tone={c.contribution >= 0 ? 'crit' : 'ok'} style={{ flex: 1 }} />
                    <span className="num tiny muted" style={{ minWidth: 48, textAlign: 'right' }}>
                      {c.contribution >= 0 ? '+' : ''}
                      {c.contribution.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Native record ── */}
        <section data-tour="task-native">
          <SectionTitle right={<SimLabel kind="seededFeed" system={task.source} seed={snapshot.feeds ? 26027 : undefined} />}>{t('native')}</SectionTitle>
          {nativeRows.length ? <KeyValue items={nativeRows.map(([k, v]) => [k, <span className={/^-?[\d,.]+$/.test(v) ? 'num' : ''}>{v}</span>])} /> : <div className="small muted">{t('nativeEmpty')}</div>}
        </section>

        {/* ── Plan decision ── */}
        <section data-tour="task-plan">
          <SectionTitle>{t('plan')}</SectionTitle>
          {place?.block ? (
            <div className="stack">
              <KeyValue
                items={[
                  [t('blockId'), <span className="mono">{place.block.id}</span>],
                  [t('date'), dateLabel(place.block.date)],
                  [
                    t('window'),
                    <span className="num">
                      {place.block.startText} – {place.block.endText} · {duration(place.block.spanMin)}
                    </span>,
                  ],
                  [t('section'), `${place.block.sectionText} · ${lineLabel(place.block.line)}`],
                  [
                    t('sharedWith'),
                    <>
                      {place.block.departments.filter((d) => d !== task.dept).length ? (
                        <span className="row-wrap">
                          {place.block.departments.filter((d) => d !== task.dept).map((d) => (
                            <DeptBadge key={d} dept={d} />
                          ))}
                        </span>
                      ) : (
                        <span className="muted">{t('sharedNone')}</span>
                      )}
                      {place.block.tasks.length > 1 && <div className="small muted mt">{t('sharedTasks', { n: place.block.tasks.length - 1 })}</div>}
                    </>,
                  ],
                  [t('status'), blockStatusLabel(place.block)],
                ]}
              />
              <div>
                <button className="btn btn-sm" onClick={() => open('block', place.block!.id, { close: 'task' })} data-tour="task-open-block">
                  <ExternalLink size={14} />
                  {t('openBlock')}
                </button>
              </div>
            </div>
          ) : place?.deferredReason ? (
            <Callout tone="warn">
              <b>{t('deferred')}</b> {place.deferredReason}
            </Callout>
          ) : rollingEntry ? (
            <Callout tone="info">
              <b>{t('rolling')}</b> {t('rollingWeek', { week: rollingEntry.weekLabel, start: dateLabel(rollingEntry.start), end: dateLabel(rollingEntry.end) })}
            </Callout>
          ) : (
            <Callout tone="neutral">{t('notPlaced')}</Callout>
          )}
        </section>
      </div>
    </Drawer>
  );
}

export default TaskDrawer;
