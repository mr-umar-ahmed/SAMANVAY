/**
 * Explainability pieces shared by the block and task drawers and the risk
 * page: up to three ranked alternative windows from the optimiser (with a
 * "Try this window" what-if for the planning cell), the computed block
 * confidence (completion × window reliability) and the ARCI bootstrap band.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, FlaskConical, Info, X } from 'lucide-react';
import { can } from '../../auth/portals';
import type { BlockAlternative, BlockConfidence, FixedBlockConstraint, Risk } from '../../engine/types';
import { useAppStore } from '../../store/useAppStore';
import { useT } from '../../i18n';
import { addDaysIso, dateLabel, hhmm, lineLabel, num, signed } from '../../lib/format';
import { Badge, Callout, DataTable, Meter, type Column } from '../ui';
import { SimLabel } from '../ui/extras';

const strings = {
  en: {
    altTitle: 'Alternative windows',
    altSub: 'Other windows the optimiser evaluated with everything else held, ranked by the change in plan cost.',
    altNone: 'The optimiser recorded no alternative window for this work.',
    altNoneFixed: 'Held in an approved block — the optimiser does not move it, so no alternatives are listed.',
    colWhen: 'When',
    colLine: 'Line',
    colWindow: 'Window',
    colDelta: 'Δ cost',
    colTrains: 'Trains',
    colDelay: 'Weighted delay',
    colFeasible: 'Feasible',
    feasible: 'Feasible',
    infeasible: 'Breaks a rule',
    scopeBlock: 'whole block',
    scopeTask: 'this work',
    minUnit: 'min',
    tryWindow: 'Try this window',
    tryHint: 'Runs a what-if candidate with these works fixed in this window; the working plan does not change until you promote it.',
    tryNoCap: 'Only the block planning cell can run a candidate.',
    trying: 'Running candidate…',
    tryBusy: 'A candidate is already running.',
    tryDone: 'Candidate ready: alternative window',
    tryDoneBody: 'Review it on the Optimiser page, then promote or discard it.',
    tryFailed: 'The candidate run failed',
    review: 'Review on the Optimiser page',
    controlHint: 'Control moves tonight’s window with Grant with change, which re-checks trains and JPO rules.',
    grantChange: 'Grant with change',
    confTitle: 'Block confidence',
    confOverall: 'Overall',
    confCompletion: 'Works finish in time',
    confWindow: 'No late train enters the window',
    confUntil: 'Work can run to {time}',
    confNone: 'No confidence computed for this block (older run or baseline).',
    bandText: 'ARCI {v} (band {lo}–{hi}, {n} resamples)',
    bandNote: 'Bootstrap over the fitted models: the 5th–95th percentile of ARCI when the Weibull and escalation models are refitted on resampled history.',
    bandNone: 'No uncertainty band in this run.',
  },
  hi: {
    altTitle: 'वैकल्पिक समय-खिड़कियाँ',
    altSub: 'बाकी सब यथावत रखकर ऑप्टिमाइज़र द्वारा जाँची गई अन्य खिड़कियाँ, योजना लागत में बदलाव के क्रम में।',
    altNone: 'ऑप्टिमाइज़र ने इस कार्य के लिए कोई वैकल्पिक खिड़की दर्ज नहीं की।',
    altNoneFixed: 'स्वीकृत block में रखा गया — ऑप्टिमाइज़र इसे नहीं हिलाता, इसलिए विकल्प नहीं दिखाए गए।',
    colWhen: 'कब',
    colLine: 'लाइन',
    colWindow: 'खिड़की',
    colDelta: 'Δ लागत',
    colTrains: 'ट्रेनें',
    colDelay: 'भारित विलंब',
    colFeasible: 'संभव',
    feasible: 'संभव',
    infeasible: 'नियम टूटता है',
    scopeBlock: 'पूरा block',
    scopeTask: 'यह कार्य',
    minUnit: 'मिनट',
    tryWindow: 'यह खिड़की आज़माएँ',
    tryHint: 'इन कार्यों को इस खिड़की में स्थिर रखकर एक what-if विकल्प चलाता है; प्रमोट करने तक चालू योजना नहीं बदलती।',
    tryNoCap: 'विकल्प केवल ब्लॉक योजना प्रकोष्ठ चला सकता है।',
    trying: 'विकल्प चल रहा है…',
    tryBusy: 'एक विकल्प पहले से चल रहा है।',
    tryDone: 'विकल्प तैयार: वैकल्पिक खिड़की',
    tryDoneBody: 'ऑप्टिमाइज़र पेज पर देखें, फिर प्रमोट या रद्द करें।',
    tryFailed: 'विकल्प run विफल',
    review: 'ऑप्टिमाइज़र पेज पर देखें',
    controlHint: 'नियंत्रण आज रात की खिड़की "बदलाव के साथ प्रदान" से बदलता है, जो ट्रेनों और JPO नियमों की फिर जाँच करता है।',
    grantChange: 'बदलाव के साथ प्रदान',
    confTitle: 'block विश्वसनीयता',
    confOverall: 'कुल',
    confCompletion: 'कार्य समय पर पूरे',
    confWindow: 'कोई देर वाली ट्रेन खिड़की में नहीं',
    confUntil: 'कार्य {time} तक चल सकता है',
    confNone: 'इस block के लिए विश्वसनीयता गणित नहीं (पुराना run या आधार-रेखा)।',
    bandText: 'ARCI {v} (दायरा {lo}–{hi}, {n} पुनः-नमूने)',
    bandNote: 'फ़िट मॉडलों पर बूटस्ट्रैप: पुनः-नमूनित इतिहास पर Weibull व एस्केलेशन मॉडल दोबारा फ़िट करने पर ARCI का 5वाँ–95वाँ प्रतिशतक।',
    bandNone: 'इस run में अनिश्चितता दायरा नहीं।',
  },
} as const;

const pctText = (v: number) => `${Math.round(v * 100)} %`;
const tone = (v: number): 'ok' | 'warn' | 'crit' => (v >= 0.8 ? 'ok' : v >= 0.6 ? 'warn' : 'crit');

/* ── alternatives ───────────────────────────────────────────────── */

export interface AlternativeWindowsProps {
  planStart: string;
  alternatives: BlockAlternative[] | undefined;
  /** works moved by a 'block'-scope alternative, with their current windows (offsets are kept) */
  blockTasks: { id: string; start: number; end: number }[];
  /** window of the block the alternatives are measured from */
  from: { start: number };
  /** work moved by a 'task'-scope alternative */
  taskId: string | null;
  fixed?: boolean;
  /** Control: open Grant with change instead of a candidate */
  onGrantWithChange?: (() => void) | null;
  grantable?: boolean;
}

export function AlternativeWindows({ planStart, alternatives, blockTasks, from, taskId, fixed, onGrantWithChange, grantable }: AlternativeWindowsProps) {
  const t = useT(strings);
  const user = useAppStore((s) => s.user);
  const runCandidate = useAppStore((s) => s.runCandidate);
  const candidateStatus = useAppStore((s) => s.candidateStatus);
  const toast = useAppStore((s) => s.toast);
  const [done, setDone] = useState<string | null>(null);
  const canPlan = can(user, 'plan');
  const list = (alternatives ?? []).slice(0, 3);
  const running = candidateStatus === 'running';

  const tryAlt = async (a: BlockAlternative, key: string) => {
    if (!canPlan) return;
    if (running) {
      toast({ title: t('tryBusy'), tone: 'warn' });
      return;
    }
    let fb: FixedBlockConstraint;
    if (a.scope === 'block') {
      const shift = a.start - from.start;
      const tasks = blockTasks.map((x) => ({ id: x.id, start: Math.max(a.start, x.start + shift), end: Math.min(a.end, x.end + shift) }));
      fb = { day: a.day, line: a.line, start: a.start, end: a.end, taskIds: blockTasks.map((x) => x.id), tasks };
    } else {
      const id = taskId ?? blockTasks[0]?.id;
      if (!id) return;
      fb = { day: a.day, line: a.line, start: a.start, end: a.end, taskIds: [id] };
    }
    await runCandidate({ fixedBlocks: [fb] }, 'alternative window');
    const s = useAppStore.getState();
    if (s.candidateStatus === 'error') toast({ title: t('tryFailed'), body: s.candidateError ?? undefined, tone: 'crit' });
    else if (s.candidate) {
      toast({ title: t('tryDone'), body: t('tryDoneBody'), tone: 'ok' });
      setDone(key);
    }
  };

  const cols: Column<BlockAlternative & { key: string }>[] = [
    {
      key: 'when',
      header: t('colWhen'),
      render: (a) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="small strong">{dateLabel(addDaysIso(planStart, a.day))}</span>
          <span className="tiny muted">{a.note} · {a.scope === 'block' ? t('scopeBlock') : t('scopeTask')}</span>
        </div>
      ),
    },
    { key: 'line', header: t('colLine'), hideMobile: true, render: (a) => lineLabel(a.line) },
    { key: 'window', header: t('colWindow'), render: (a) => <span className="mono num small">{a.startText ?? hhmm(a.start)}–{a.endText ?? hhmm(a.end)}</span> },
    { key: 'delta', header: t('colDelta'), num: true, render: (a) => <span className="num" style={{ color: a.deltaCost < 0 ? 'var(--ok)' : undefined }}>{signed(a.deltaCost)}</span> },
    { key: 'trains', header: t('colTrains'), num: true, hideMobile: true, render: (a) => <span className="num">{a.trainsAffected}{a.premiumConflicts ? ` · ${a.premiumConflicts}★` : ''}</span> },
    { key: 'delay', header: t('colDelay'), num: true, hideMobile: true, render: (a) => <span className="num">{num(a.weightedDelayMin)} {t('minUnit')}</span> },
    {
      key: 'ok',
      header: t('colFeasible'),
      render: (a) => (a.feasible ? <Badge tone="ok" icon={<Check size={11} />}>{t('feasible')}</Badge> : <Badge tone="crit" icon={<X size={11} />} title={a.reason ?? undefined}>{t('infeasible')}</Badge>),
    },
    ...(canPlan
      ? [
          {
            key: 'try',
            header: '',
            render: (a: BlockAlternative & { key: string }) => (
              <button type="button" className="btn btn-sm" disabled={running} title={t('tryHint')} onClick={() => void tryAlt(a, a.key)}>
                <FlaskConical size={12} /> {running ? t('trying') : t('tryWindow')}
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row-wrap" style={{ gap: 6 }}>
        <span className="tiny muted grow">{t('altSub')}</span>
        <SimLabel kind="solver" short />
      </div>
      {list.length === 0 ? (
        <div className="small muted">{fixed ? t('altNoneFixed') : t('altNone')}</div>
      ) : (
        <>
          <DataTable rows={list.map((a, i) => ({ ...a, key: `${a.day}|${a.line}|${a.start}|${i}` }))} columns={cols} rowKey={(a) => a.key} compact />
          {list.some((a) => !a.feasible && a.reason) && (
            <ul className="tiny muted" style={{ margin: 0, paddingLeft: 16 }}>
              {list.filter((a) => !a.feasible && a.reason).map((a) => (
                <li key={`${a.day}-${a.start}`}>{dateLabel(addDaysIso(planStart, a.day))} {a.startText}: {a.reason}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {canPlan && done && (
        <Callout tone="ok">
          <div className="row-wrap" style={{ gap: 8 }}>
            <span className="small grow">{t('tryDoneBody')}</span>
            <Link className="btn btn-sm btn-dark" to="/app/planning/optimiser">
              {t('review')} <ArrowRight size={12} />
            </Link>
          </div>
        </Callout>
      )}
      {!canPlan && onGrantWithChange !== undefined && (
        <div className="row-wrap" style={{ gap: 8 }}>
          <span className="tiny muted grow">{t('controlHint')}</span>
          {onGrantWithChange && (
            <button type="button" className="btn btn-sm" disabled={!grantable} onClick={onGrantWithChange}>
              {t('grantChange')}
            </button>
          )}
        </div>
      )}
      {!canPlan && onGrantWithChange === undefined && list.length > 0 && <div className="tiny muted">{t('tryNoCap')}</div>}
    </div>
  );
}

/* ── block confidence ───────────────────────────────────────────── */

export function ConfidenceView({ confidence }: { confidence: BlockConfidence | undefined }) {
  const t = useT(strings);
  if (!confidence) return <div className="small muted">{t('confNone')}</div>;
  const rows: [string, number][] = [
    [t('confOverall'), confidence.overall],
    [t('confCompletion'), confidence.completion],
    [t('confWindow'), confidence.windowReliability],
  ];
  return (
    <div className="stack" style={{ gap: 6 }}>
      {rows.map(([label, v], i) => (
        <div key={label} className="row" style={{ gap: 8 }}>
          <span className={`small ${i === 0 ? 'strong' : ''}`} style={{ minWidth: 170 }}>{label}</span>
          <Meter value={v} tone={tone(v)} style={{ flex: 1, maxWidth: 220 }} />
          <span className="num small strong" style={{ minWidth: 44, textAlign: 'right' }}>{pctText(v)}</span>
        </div>
      ))}
      <div className="tiny muted row" style={{ gap: 6, alignItems: 'flex-start' }}>
        <Info size={12} style={{ flex: 'none', marginTop: 2 }} />
        <span>
          {confidence.basis}
          {Number.isFinite(confidence.availableUntil) ? ` · ${t('confUntil', { time: hhmm(confidence.availableUntil) })}` : ''}
        </span>
      </div>
    </div>
  );
}

/* ── ARCI band ──────────────────────────────────────────────────── */

export function ArciBandLine({ risk, note = true }: { risk: Risk; note?: boolean }) {
  const t = useT(strings);
  const b = risk.band;
  if (!b) return note ? <div className="tiny muted">{t('bandNone')}</div> : null;
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="small num">{t('bandText', { v: risk.arci.toFixed(2), lo: b.low.toFixed(2), hi: b.high.toFixed(2), n: b.samples })}</span>
      {note && <span className="tiny muted">{t('bandNote')}</span>}
    </div>
  );
}

/** Compact "0.65–0.80" for tables, with the explanation on hover. */
export function ArciBandCell({ risk }: { risk: Risk }) {
  const t = useT(strings);
  const b = risk.band;
  if (!b) return <span className="tiny muted">—</span>;
  return (
    <span className="tiny muted num" title={`${t('bandText', { v: risk.arci.toFixed(2), lo: b.low.toFixed(2), hi: b.high.toFixed(2), n: b.samples })} — ${t('bandNote')}`}>
      {b.low.toFixed(2)}–{b.high.toFixed(2)}
    </span>
  );
}
