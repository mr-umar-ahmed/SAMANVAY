/**
 * BlockDrawer — the block requisition drawer used by every portal.
 * Opens from `?block=<id>`. Everything shown is computed by the engine or
 * recorded by a user action; every button is gated by capabilities and
 * explains itself when disabled.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, FileText, Lock, Play, Printer, ShieldAlert, Square, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ExecItem } from '../../store/useAppStore';
import { disconnectionNotices, evaluateBlockWindow, workingBlocks, type WorkingBlock } from '../../engine/select';
import { toBdmsDemand } from '../../engine/exporter.js';
import type { Dept } from '../../engine/types';
import { can } from '../../auth/portals';
import { usePortal } from '../../app/usePortal';
import { useT } from '../../i18n';
import { ArciBar, Badge, Callout, Card, CardBody, CardHead, DataTable, DeptBadge, Drawer, Field, KeyValue, Modal, SectionTitle, StatusBadge, type Column } from '../ui';
import { AuditTrail, FormSheet, PrintButton, SimLabel } from '../ui/extras';
import { DEPT_LABEL, classLabel, copyText, dateLong, duration, hhmm, kmRange, lineLabel, timeAgo, toMin } from '../../lib/format';
import { useDrawerParams } from './useDrawerParams';
import { blockStrings } from './block/strings';
import { GrantWithChange } from './block/GrantWithChange';
import type { AffectedTrain, BlockTask } from '../../engine/types';

type ObjReason = 'objGang' | 'objMachine' | 'objNotice' | 'objPartner' | 'objOther';
type RefReason = 'refTraffic' | 'refFailure' | 'refGang' | 'refT351' | 'refMachine' | 'refOther';
const OBJ_REASONS: ObjReason[] = ['objGang', 'objMachine', 'objNotice', 'objPartner', 'objOther'];
const REF_REASONS: RefReason[] = ['refTraffic', 'refFailure', 'refGang', 'refT351', 'refMachine', 'refOther'];

export function BlockDrawer({ blockId, onClose }: { blockId: string | null; onClose: () => void }) {
  const t = useT(blockStrings);
  const portal = usePortal();
  const drawer = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const forms = useAppStore((s) => s.forms);
  const powerBlocks = useAppStore((s) => s.powerBlocks);
  const executionLog = useAppStore((s) => s.executionLog);
  const audit = useAppStore((s) => s.audit);
  const corridorId = useAppStore((s) => s.corridorId);
  const concur = useAppStore((s) => s.concur);
  const object = useAppStore((s) => s.object);
  const grant = useAppStore((s) => s.grant);
  const refuse = useAppStore((s) => s.refuse);
  const lock = useAppStore((s) => s.lock);
  const setIncharge = useAppStore((s) => s.setIncharge);
  const setResources = useAppStore((s) => s.setResources);
  const startPossession = useAppStore((s) => s.startPossession);
  const clearPossession = useAppStore((s) => s.clearPossession);
  const toast = useAppStore((s) => s.toast);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const block = useMemo(() => (blockId ? blocks.find((b) => b.id === blockId) ?? null : null), [blocks, blockId]);

  /* ── local UI state ──────────────────────────────────────── */
  const [inchargeDraft, setInchargeDraft] = useState('');
  const [machineDraft, setMachineDraft] = useState('');
  const [crewDraft, setCrewDraft] = useState('');
  const [concurFor, setConcurFor] = useState<Dept | null>(null);
  const [concurNote, setConcurNote] = useState('');
  const [objectFor, setObjectFor] = useState<Dept | null>(null);
  const [objReason, setObjReason] = useState<ObjReason>('objGang');
  const [objDetail, setObjDetail] = useState('');
  const [changeOpen, setChangeOpen] = useState(false);
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [refReason, setRefReason] = useState<RefReason>('refTraffic');
  const [refDetail, setRefDetail] = useState('');
  const [t351Ack, setT351Ack] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [clearTime, setClearTime] = useState('');
  const [overrun, setOverrun] = useState('');
  const [speedLift, setSpeedLift] = useState('');
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    setInchargeDraft(block?.approval?.incharge ?? '');
    setMachineDraft(block?.approval?.resources?.machineId ?? '');
    setCrewDraft(block?.approval?.resources?.crewId ?? '');
    setT351Ack(false);
    setStartTime(block ? hhmm(block.start) : '');
    setClearTime(block ? hhmm(block.end) : '');
  }, [block?.id, block?.approval?.incharge, block?.approval?.resources?.machineId, block?.approval?.resources?.crewId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── derivations ─────────────────────────────────────────── */
  const rules = snapshot?.result.rules;
  const evaluation = useMemo(() => (snapshot && block ? evaluateBlockWindow(snapshot, block, block.start, block.end, blocks) : null), [snapshot, block, blocks]);
  const notices = useMemo(() => (snapshot && block ? disconnectionNotices(snapshot, blocks, forms, block.day).filter((n) => n.blockId === block.id) : []), [snapshot, blocks, forms, block]);
  const execRec = useMemo(() => (block ? executionLog.find((r) => r.blockId === block.id) ?? null : null), [executionLog, block]);
  const trail = useMemo(() => (block ? audit.filter((e) => e.entityId === block.id) : []), [audit, block]);
  const payload = useMemo(() => (snapshot && block ? toBdmsDemand(block, snapshot.corridor, snapshot.planStart) : null), [snapshot, block]);
  const payloadJson = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ''), [payload]);

  if (!snapshot || !block || !rules || !evaluation) return null;

  const machines = snapshot.feeds.machines;
  const crews = snapshot.feeds.crews;
  const machineLabel = (id: string) => machines.find((m) => m.id === id)?.label ?? id;
  const crewLabel = (id: string) => crews.find((c) => c.id === id)?.label ?? id;
  const approval = block.approval;
  const isPower = block.kind === 'POWER' || block.kind === 'TRAFFIC + POWER';
  const hasSmms = block.tasks.some((x) => x.dept === 'SMMS');
  const t351Pending = hasSmms && notices.some((n) => n.status !== 'RECEIVED' && n.status !== 'RECONNECTED');
  const canGrant = can(user, 'grant');
  const canLock = can(user, 'lock');
  const canExecute = can(user, 'execute');
  const canPlan = can(user, 'plan');
  const missingDepts = block.departments.filter((d) => !approval?.concur[d]);
  const grantable = block.status === 'PROPOSED' && block.concurred && canGrant;
  const lockable = block.status === 'GRANTED' && canLock;
  const kindLabel = block.kind === 'POWER' ? t('kindPower') : block.kind === 'TRAFFIC + POWER' ? t('kindTrafficPower') : block.kind === 'DISCONNECTION' ? t('kindDisconnection') : t('kindTraffic');
  const formsRoute = portal === 'control' ? '/app/control/caution' : portal === 'tms' || portal === 'smms' || portal === 'tdms' ? `/app/${portal}/forms` : null;
  const overrideMachine = approval?.resources?.machineId;
  const overrideCrew = approval?.resources?.crewId;
  const powerStatus = powerBlocks[block.id]?.status ?? 'PENDING';

  /* ── rule chips ──────────────────────────────────────────── */
  const sameDay = blocks.filter((o) => o.id !== block.id && o.day === block.day && o.lineClosure && o.status !== 'REFUSED');
  const concurrent = sameDay.filter((o) => Math.max(o.start, block.start) < Math.min(o.end, block.end)).length + 1;
  const ruleChips: { key: string; label: string; ok: boolean; detail: string }[] = [
    { key: 'ceiling', label: t('ruleCeiling'), ok: block.spanMin <= rules.maxBlockMin, detail: t('ruleDetailCeiling', { span: block.spanMin, max: rules.maxBlockMin }) },
    { key: 'min', label: t('ruleMin'), ok: block.spanMin >= rules.minBlockMin, detail: t('ruleDetailMin', { span: block.spanMin, min: rules.minBlockMin }) },
    { key: 'concurrent', label: t('ruleConcurrent'), ok: concurrent <= rules.maxConcurrentBlocks, detail: t('ruleDetailConcurrent', { n: concurrent, max: rules.maxConcurrentBlocks }) },
    { key: 'perDay', label: t('rulePerDay'), ok: sameDay.length + 1 <= rules.maxBlocksPerDay, detail: t('ruleDetailPerDay', { n: sameDay.length + 1, max: rules.maxBlocksPerDay }) },
    { key: 'premium', label: t('rulePremium'), ok: block.premiumConflicts === 0, detail: t('ruleDetailPremium', { n: block.premiumConflicts }) },
  ];

  /* ── actions ─────────────────────────────────────────────── */
  const saveIncharge = () => {
    const name = inchargeDraft.trim();
    if (!name) return;
    setIncharge(block.id, name);
    toast({ title: t('inchargeSaved'), body: `${block.id} · ${name}`, tone: 'ok' });
  };
  const saveResources = () => {
    setResources(block.id, { machineId: machineDraft || undefined, crewId: crewDraft || undefined });
    toast({ title: t('resourcesSaved'), body: [machineDraft && machineLabel(machineDraft), crewDraft && crewLabel(crewDraft)].filter(Boolean).join(' · ') || t('keepPlanned'), tone: 'ok' });
  };
  const doConcur = () => {
    if (!concurFor) return;
    concur(block.id, concurFor, concurNote.trim() || undefined);
    toast({ title: t('concurDone', { dept: DEPT_LABEL[concurFor].short }), body: block.id, tone: 'ok' });
    setConcurFor(null);
    setConcurNote('');
  };
  const doObject = () => {
    if (!objectFor) return;
    const reason = `${t(objReason)}${objDetail.trim() ? ` — ${objDetail.trim()}` : ''}`;
    if (objReason === 'objOther' && !objDetail.trim()) return;
    object(block.id, objectFor, reason);
    toast({ title: t('objectDone', { dept: DEPT_LABEL[objectFor].short }), body: reason, tone: 'warn' });
    setObjectFor(null);
    setObjDetail('');
  };
  const doGrant = () => {
    grant(block.id);
    toast({ title: t('grantDone', { id: block.id }), body: `${block.sectionText} · ${hhmm(block.start)}–${hhmm(block.end)}`, tone: 'ok' });
  };
  const doGrantChange = (start: number, end: number) => {
    grant(block.id, { start, end });
    toast({ title: t('grantChangeDone', { id: block.id }), body: `${hhmm(start)}–${hhmm(end)} · ${duration(end - start)}`, tone: 'ok' });
    setChangeOpen(false);
  };
  const doRefuse = () => {
    const reason = `${t(refReason)}${refDetail.trim() ? ` — ${refDetail.trim()}` : ''}`;
    if (refReason === 'refOther' && !refDetail.trim()) return;
    refuse(block.id, reason);
    toast({ title: t('refuseDone', { id: block.id }), body: reason, tone: 'crit' });
    setRefuseOpen(false);
    setRefDetail('');
  };
  const doLock = () => {
    lock(block.id);
    toast({ title: t('lockDone', { id: block.id }), body: block.sectionText, tone: 'ok' });
  };
  const execItems = (): ExecItem[] => block.tasks.map((x) => ({ taskId: x.id, label: x.label, dept: x.dept, workType: x.workType, plannedMin: x.end - x.start, done: false }));
  const doStart = () => {
    const actualStart = toMin(startTime || hhmm(block.start));
    startPossession({ blockId: block.id, corridorId, date: block.date, sectionText: block.sectionText, line: block.line, plannedStart: block.start, plannedEnd: block.end, plannedSpanMin: block.spanMin, items: execItems(), actualStart, source: portal === 'control' ? 'control' : 'field' });
    toast({ title: t('startDone', { id: block.id }), body: hhmm(actualStart), tone: 'ok' });
    setStartOpen(false);
  };
  const doClear = () => {
    const actualEnd = toMin(clearTime || hhmm(block.end));
    const speed = speedLift.trim() === '' ? null : Number(speedLift);
    clearPossession(block.id, { actualEnd, overrunCause: overrun.trim() || undefined, speedOnLifting: Number.isFinite(speed) ? speed : null, source: portal === 'control' ? 'control' : 'field' });
    toast({ title: t('clearDone', { id: block.id }), body: hhmm(actualEnd), tone: 'ok' });
    setClearOpen(false);
  };
  const doCopy = async () => {
    const ok = await copyText(payloadJson);
    toast({ title: ok ? t('copied') : t('copyFailed'), body: block.id, tone: ok ? 'ok' : 'warn' });
  };

  /* ── columns ─────────────────────────────────────────────── */
  const workCols: Column<BlockTask>[] = [
    { key: 'dept', header: t('department'), render: (x) => <DeptBadge dept={x.dept} /> },
    {
      key: 'label',
      header: t('work'),
      render: (x) => (
        <div>
          <div className="strong small">{x.label}</div>
          <div className="tiny muted mono">
            {x.id}
            {x.closure === 'NONE' ? ` · ${t('nested')}` : ''}
          </div>
        </div>
      ),
    },
    { key: 'window', header: t('window'), render: (x) => <span className="mono num">{x.startText}–{x.endText}</span> },
    { key: 'arci', header: 'ARCI', render: (x) => <ArciBar value={x.arci} />, hideMobile: true },
    { key: 'why', header: '', render: (x) => <button className="btn btn-sm btn-ghost" onClick={() => drawer.open('task', x.id)}>{t('why')}</button> },
  ];
  const trainCols: Column<AffectedTrain>[] = [
    { key: 'number', header: t('train'), render: (x) => (
      <div>
        <span className="mono strong">{x.number}</span>
        <span className="tiny muted" style={{ display: 'block' }}>{x.name}</span>
      </div>
    ) },
    { key: 'cls', header: t('cls'), render: (x) => <Badge tone={x.premium ? 'crit' : 'outline'}>{classLabel(x.cls)}</Badge>, hideMobile: true },
    { key: 'mode', header: t('handling'), render: (x) => (x.mode === 'SLW' ? t('slw') : x.mode === 'HELD' ? t('held') : t('regulated')) },
    { key: 'delay', header: t('delay'), num: true, render: (x) => <span className="num">{Math.round(x.delayMin)} {t('minutes')}</span> },
  ];

  const powerText = powerStatus === 'DEENERGISED' ? t('powerDeenergised') : powerStatus === 'ENERGISED' ? t('powerEnergised') : t('powerPending');

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={block.id}
        subtitle={`${t('subtitle')} · ${block.sectionText} · ${lineLabel(block.line)}`}
        width={760}
        badges={
          <>
            {block.departments.map((d) => (
              <DeptBadge key={d} dept={d} />
            ))}
            {block.coLocated && <Badge tone="lavender">{t('coLocated')}</Badge>}
            <StatusBadge status={block.status} />
            {block.premiumConflicts > 0 && <Badge tone="crit" icon={<ShieldAlert />}>{t('premiumConflict')}</Badge>}
            <Badge tone="outline">{kindLabel}</Badge>
            {block.overridden && <Badge tone="warn">{t('overridden')}</Badge>}
          </>
        }
      >
        <div className="stack-lg">
          {/* 2 ── key / value */}
          <KeyValue
            items={[
              [t('date'), dateLong(block.date)],
              [t('window'), <span className="mono num">{hhmm(block.start)}–{hhmm(block.end)} · {duration(block.spanMin)}</span>],
              [t('sections'), `${block.sectionLabels.join(' / ')} · ${kmRange(block.startKm, block.endKm)}`],
              ...(block.powerIsolation
                ? [[t('powerIsolation'), (
                    <div>
                      <div>{block.powerIsolation}</div>
                      {block.oheSections.length > 0 && (
                        <div className="tiny muted">{t('elementarySections')}: {block.oheSections.map((o) => `${o.label} (${o.spFrom} → ${o.spTo})`).join(', ')}</div>
                      )}
                    </div>
                  )] as [React.ReactNode, React.ReactNode]]
                : []),
              [t('machines'), (
                <span className="row-wrap">
                  {overrideMachine && <Badge tone="warn">{machineLabel(overrideMachine)} · {t('override')}</Badge>}
                  {block.machines.length ? block.machines.map((m) => <Badge key={m} tone="gray">{machineLabel(m)}</Badge>) : <span className="muted">{t('noMachine')}</span>}
                  <SimLabel kind="seededFeed" system={block.departments[0]} seed={26027} short />
                </span>
              )],
              [t('gangs'), (
                <span className="row-wrap">
                  {overrideCrew && <Badge tone="warn">{crewLabel(overrideCrew)} · {t('override')}</Badge>}
                  {block.crews.length ? block.crews.map((c) => <Badge key={c} tone="gray">{crewLabel(c)}</Badge>) : <span className="muted">{t('noGang')}</span>}
                </span>
              )],
              [t('incharge'), (
                canExecute || canPlan ? (
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <input className="input" style={{ maxWidth: 260 }} value={inchargeDraft} placeholder={t('inchargePlaceholder')} onChange={(e) => setInchargeDraft(e.target.value)} />
                    <button className="btn btn-sm" disabled={!inchargeDraft.trim() || inchargeDraft.trim() === (approval?.incharge ?? '')} onClick={saveIncharge}>{t('save')}</button>
                  </div>
                ) : (
                  <span title={t('inchargeHint')}>{approval?.incharge ?? <span className="muted">{t('inchargeNone')}</span>}</span>
                )
              )],
            ]}
          />

          {/* resources override */}
          <div className="stack">
            <SectionTitle>{t('resources')}</SectionTitle>
            {canExecute ? (
              <div className="row-wrap">
                <select className="select" value={machineDraft} onChange={(e) => setMachineDraft(e.target.value)} aria-label={t('machineSelect')} style={{ maxWidth: 260 }}>
                  <option value="">{t('machineSelect')} · {t('keepPlanned')}</option>
                  {machines.filter((m) => block.departments.includes(m.dept)).map((m) => (
                    <option key={m.id} value={m.id}>{m.label} · {m.type} · {m.homeStation}</option>
                  ))}
                </select>
                <select className="select" value={crewDraft} onChange={(e) => setCrewDraft(e.target.value)} aria-label={t('crewSelect')} style={{ maxWidth: 260 }}>
                  <option value="">{t('crewSelect')} · {t('keepPlanned')}</option>
                  {crews.filter((c) => block.departments.includes(c.dept)).map((c) => (
                    <option key={c.id} value={c.id}>{c.label} · {c.type} · {c.baseStation}</option>
                  ))}
                </select>
                <button className="btn btn-sm" onClick={saveResources} disabled={machineDraft === (overrideMachine ?? '') && crewDraft === (overrideCrew ?? '')}>{t('assign')}</button>
              </div>
            ) : (
              <div className="small muted">{t('resourcesHint')}</div>
            )}
          </div>

          {/* 3 ── works */}
          <div className="stack">
            <SectionTitle>{t('works')}</SectionTitle>
            <DataTable columns={workCols} rows={block.tasks} rowKey={(x) => x.id} compact />
          </div>

          {/* 4 ── traffic impact */}
          <div className="stack">
            <SectionTitle right={<SimLabel kind="wttPositions" short />}>{t('traffic')}</SectionTitle>
            {block.affectedTrains.length === 0 ? (
              <Callout tone="ok">{t('noTrains')}</Callout>
            ) : (
              <>
                <DataTable columns={trainCols} rows={block.affectedTrains} rowKey={(x) => x.trainId} compact maxHeight={280} />
                <div className="small muted">
                  {t('delaySentence', { trains: block.affectedTrains.length, weighted: Math.round(block.weightedDelayMin), raw: Math.round(block.rawDelayMin) })}
                  {block.premiumConflicts > 0 ? ` ${t('premiumSentence', { n: block.premiumConflicts })}` : ''}
                </div>
              </>
            )}
          </div>

          {/* 5 ── rule checks */}
          <div className="stack">
            <SectionTitle>{t('rules')}</SectionTitle>
            <div className="row-wrap">
              {ruleChips.map((r) => (
                <Badge key={r.key} tone={r.ok ? 'ok' : 'crit'} icon={r.ok ? <Check /> : <X />} title={r.detail}>
                  {r.label} · {r.ok ? t('rulePass') : t('ruleFail')}
                </Badge>
              ))}
            </div>
            {evaluation.ruleViolations.length > 0 && (
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {evaluation.ruleViolations.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            )}
          </div>

          {/* 6 ── forms & isolation */}
          <div className="stack">
            <SectionTitle right={formsRoute ? <Link className="btn btn-sm btn-ghost" to={formsRoute}><FileText /> {portal === 'control' ? t('openCaution') : t('openForms')}</Link> : undefined}>{t('forms')}</SectionTitle>
            <div className="small strong">{t('t351')}</div>
            {hasSmms ? (
              notices.length ? (
                <div className="stack" style={{ gap: 6 }}>
                  {notices.map((n) => (
                    <div key={n.id} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="mono small">{n.noticeNo}</span>
                      <span className="small muted grow truncate">{n.gear}</span>
                      <StatusBadge status={n.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="small muted">{t('noT351')}</div>
              )
            ) : (
              <div className="small muted">{t('noT351')}</div>
            )}
            {isPower && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="small strong">{t('powerStatus')}</span>
                <StatusBadge status={powerStatus} />
                <span className="small muted">{powerText}{powerBlocks[block.id] ? ` · ${powerBlocks[block.id].by} · ${timeAgo(powerBlocks[block.id].at)}` : ''}</span>
              </div>
            )}
          </div>

          {/* 7 ── joint approval workflow */}
          <div className="stack" data-tour="block-workflow">
            <SectionTitle>{t('workflow')}</SectionTitle>
            <div className="grid grid-auto" style={{ gap: 10 }}>
              {block.departments.map((d) => {
                const c = approval?.concur[d];
                const objs = approval?.objections.filter((o) => o.dept === d) ?? [];
                const may = can(user, `concur:${d}` as const) && block.status === 'PROPOSED';
                return (
                  <Card key={d} pastel={c ? 'green' : objs.length ? 'pink' : 'gray'}>
                    <CardBody tight>
                      <div className="row" style={{ gap: 8 }}>
                        <DeptBadge dept={d} />
                        <span className="small muted grow">{DEPT_LABEL[d].officer}</span>
                        {c ? <Badge tone="ok" icon={<Check />}>{t('concur')}</Badge> : objs.length ? <Badge tone="crit">{t('objection')}</Badge> : <Badge tone="gray">{t('pending')}</Badge>}
                      </div>
                      {c && <div className="tiny muted mt">{t('concurredBy', { by: c.by })} · {timeAgo(c.at)}{c.note ? ` · ${c.note}` : ''}</div>}
                      {objs.map((o, i) => (
                        <div key={i} className="tiny mt" style={{ color: 'var(--crit)' }}>{o.by} · {timeAgo(o.at)} · {o.reason}</div>
                      ))}
                      <div className="row-wrap mt">
                        <button className="btn btn-sm btn-ok" disabled={!may || !!c} title={!may ? t('cannotConcur', { officer: DEPT_LABEL[d].officer, dept: DEPT_LABEL[d].short }) : c ? t('alreadyConcurred') : undefined} onClick={() => setConcurFor(d)}>
                          <Check /> {t('concur')}
                        </button>
                        <button className="btn btn-sm" disabled={!may} title={!may ? t('cannotConcur', { officer: DEPT_LABEL[d].officer, dept: DEPT_LABEL[d].short }) : undefined} onClick={() => setObjectFor(d)}>
                          <X /> {t('object')}
                        </button>
                      </div>
                      {!may && <div className="tiny muted mt">{block.status !== 'PROPOSED' ? t('grantHintStatus', { status: block.status.toLowerCase() }) : t('cannotConcur', { officer: DEPT_LABEL[d].officer, dept: DEPT_LABEL[d].short })}</div>}
                    </CardBody>
                  </Card>
                );
              })}
            </div>

            <Card pastel={block.status === 'GRANTED' || block.status === 'LOCKED' ? 'green' : block.status === 'REFUSED' ? 'pink' : 'lavender'}>
              <CardHead title={t('grantCard')} right={<StatusBadge status={block.status} />} />
              <CardBody tight>
                {approval?.grantedAt && <div className="small">{t('grantedAt', { by: approval.grantedBy ?? '', when: timeAgo(approval.grantedAt) })}</div>}
                {approval?.lockedAt && <div className="small">{t('lockedAt', { by: approval.lockedBy ?? '', when: timeAgo(approval.lockedAt) })}</div>}
                {approval?.refusal && block.status === 'REFUSED' && <div className="small" style={{ color: 'var(--crit)' }}>{t('refusedAt', { by: approval.refusal.by, when: timeAgo(approval.refusal.at), reason: approval.refusal.reason })}</div>}
                {t351Pending && block.status === 'PROPOSED' && (
                  <Callout tone="warn">
                    <div className="strong">{t('t351Warning')}</div>
                    {grantable && (
                      <label className="check mt">
                        <input type="checkbox" checked={t351Ack} onChange={(e) => setT351Ack(e.target.checked)} />
                        <span className="small">{t('t351Confirm')}</span>
                      </label>
                    )}
                  </Callout>
                )}
                <div className="row-wrap mt">
                  <button className="btn btn-sm btn-primary" disabled={!grantable || (t351Pending && !t351Ack)} onClick={doGrant}>
                    <Check /> {t('grant')}
                  </button>
                  <button className="btn btn-sm" disabled={!grantable} onClick={() => setChangeOpen(true)}>{t('grantWithChange')}</button>
                  <button className="btn btn-sm btn-danger" disabled={!canGrant || block.status !== 'PROPOSED'} onClick={() => setRefuseOpen(true)}>{t('refuse')}</button>
                  <button className="btn btn-sm btn-dark" disabled={!lockable} onClick={doLock}>
                    <Lock /> {t('lockCoa')}
                  </button>
                </div>
                <div className="tiny muted mt">
                  {block.status !== 'PROPOSED'
                    ? block.status === 'GRANTED'
                      ? canLock ? '' : t('lockHintRole')
                      : t('grantHintStatus', { status: block.status.toLowerCase() })
                    : !canGrant
                      ? t('grantHintRole')
                      : missingDepts.length
                        ? t('grantHintConcur', { depts: missingDepts.map((d) => DEPT_LABEL[d].short).join(', ') })
                        : t('lockHintStatus')}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* 8 ── execution */}
          <div className="stack">
            <SectionTitle>{t('execution')}</SectionTitle>
            {execRec ? (
              <KeyValue
                items={[
                  [t('status'), <StatusBadge status={execRec.status} />],
                  [t('actualStart'), <span className="mono num">{execRec.actualStart !== undefined ? hhmm(execRec.actualStart) : '—'}</span>],
                  [t('actualEnd'), <span className="mono num">{execRec.actualEnd !== undefined ? hhmm(execRec.actualEnd) : '—'}</span>],
                  [t('itemsDone'), <span className="num">{execRec.items.filter((i) => i.done).length} / {execRec.items.length}</span>],
                ]}
              />
            ) : (
              <div className="small muted">{t('noExecution')}</div>
            )}
            <div className="row-wrap">
              <button className="btn btn-sm" disabled={!canExecute || !!execRec || (block.status !== 'GRANTED' && block.status !== 'LOCKED')} onClick={() => setStartOpen(true)}>
                <Play /> {t('recordStart')}
              </button>
              <button className="btn btn-sm" disabled={!canExecute || !execRec || execRec.status !== 'IN_PROGRESS'} onClick={() => setClearOpen(true)}>
                <Square /> {t('recordClear')}
              </button>
              {!canExecute ? <span className="tiny muted">{t('executeHint')}</span> : block.status !== 'GRANTED' && block.status !== 'LOCKED' && !execRec ? <span className="tiny muted">{t('executeHintStatus')}</span> : null}
            </div>
          </div>

          {/* 9 ── audit trail */}
          <div className="stack">
            <SectionTitle>{t('audit')}</SectionTitle>
            <AuditTrail entries={trail} />
          </div>

          {/* 10 ── BDMS payload */}
          <div className="stack">
            <SectionTitle right={<SimLabel kind="notOfficial" short />}>{t('bdms')}</SectionTitle>
            <div className="tiny muted">{t('bdmsHint')}</div>
            <pre className="small" style={{ margin: 0, padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-2)', overflowX: 'auto', maxHeight: 320 }}>{payloadJson}</pre>
            <div className="row-wrap">
              <button className="btn btn-sm" onClick={() => void doCopy()}>
                <Copy /> {t('copyJson')}
              </button>
              <button className="btn btn-sm" onClick={() => setPrintOpen(true)}>
                <Printer /> {t('printReq')}
              </button>
            </div>
          </div>
        </div>
      </Drawer>

      {/* ── modals ─────────────────────────────────────────── */}
      <Modal
        open={concurFor !== null}
        onClose={() => setConcurFor(null)}
        title={`${t('concur')} · ${concurFor ? DEPT_LABEL[concurFor].short : ''}`}
        footer={
          <div className="row-wrap" style={{ width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConcurFor(null)}>{t('cancel')}</button>
            <button className="btn btn-ok" onClick={doConcur}><Check /> {t('concur')}</button>
          </div>
        }
      >
        <Field label={t('concurNote')}>
          <textarea className="textarea" rows={3} value={concurNote} placeholder={t('concurNotePlaceholder')} onChange={(e) => setConcurNote(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={objectFor !== null}
        onClose={() => setObjectFor(null)}
        title={`${t('object')} · ${objectFor ? DEPT_LABEL[objectFor].short : ''}`}
        footer={
          <div className="row-wrap" style={{ width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setObjectFor(null)}>{t('cancel')}</button>
            <button className="btn btn-danger" disabled={objReason === 'objOther' && !objDetail.trim()} onClick={doObject}>{t('object')}</button>
          </div>
        }
      >
        <div className="stack">
          <Field label={t('objectReason')}>
            <select className="select" value={objReason} onChange={(e) => setObjReason(e.target.value as ObjReason)}>
              {OBJ_REASONS.map((r) => (
                <option key={r} value={r}>{t(r)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('objDetail')} error={objReason === 'objOther' && !objDetail.trim() ? t('objDetailRequired') : undefined}>
            <textarea className="textarea" rows={3} value={objDetail} onChange={(e) => setObjDetail(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={refuseOpen}
        onClose={() => setRefuseOpen(false)}
        title={`${t('refuse')} · ${block.id}`}
        footer={
          <div className="row-wrap" style={{ width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setRefuseOpen(false)}>{t('cancel')}</button>
            <button className="btn btn-danger" disabled={refReason === 'refOther' && !refDetail.trim()} onClick={doRefuse}>{t('refuse')}</button>
          </div>
        }
      >
        <div className="stack">
          <Field label={t('refuseReason')}>
            <select className="select" value={refReason} onChange={(e) => setRefReason(e.target.value as RefReason)}>
              {REF_REASONS.map((r) => (
                <option key={r} value={r}>{t(r)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('refDetail')} error={refReason === 'refOther' && !refDetail.trim() ? t('refDetailRequired') : undefined}>
            <textarea className="textarea" rows={3} value={refDetail} onChange={(e) => setRefDetail(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {changeOpen && <GrantWithChange open onClose={() => setChangeOpen(false)} snapshot={snapshot} block={block} others={blocks} t351Pending={t351Pending} onConfirm={doGrantChange} />}

      <Modal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title={`${t('recordStart')} · ${block.id}`}
        footer={
          <div className="row-wrap" style={{ width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setStartOpen(false)}>{t('cancel')}</button>
            <button className="btn btn-primary" onClick={doStart}><Play /> {t('recordStart')}</button>
          </div>
        }
      >
        <Field label={t('startTime')} hint={`${t('window')}: ${hhmm(block.start)}–${hhmm(block.end)}`}>
          <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title={`${t('recordClear')} · ${block.id}`}
        footer={
          <div className="row-wrap" style={{ width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setClearOpen(false)}>{t('cancel')}</button>
            <button className="btn btn-primary" onClick={doClear}><Square /> {t('recordClear')}</button>
          </div>
        }
      >
        <div className="stack">
          <Field label={t('clearTime')}>
            <input className="input" type="time" value={clearTime} onChange={(e) => setClearTime(e.target.value)} />
          </Field>
          <Field label={t('overrunCause')}>
            <input className="input" value={overrun} onChange={(e) => setOverrun(e.target.value)} />
          </Field>
          <Field label={t('speedOnLifting')}>
            <input className="input" type="number" min={10} max={snapshot.corridor.mpsKmph} step={5} value={speedLift} onChange={(e) => setSpeedLift(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal open={printOpen} onClose={() => setPrintOpen(false)} title={t('printReq')} width={720} footer={<div className="row-wrap" style={{ width: '100%', justifyContent: 'flex-end' }}><button className="btn" onClick={() => setPrintOpen(false)}>{t('close')}</button><PrintButton label={t('print')} targetId={`req-${block.id}`} /></div>}>
        <FormSheet id={`req-${block.id}`} title={t('requisition')} formNo={block.id}>
          <RequisitionSheet block={block} payload={payload as Record<string, unknown>} corridorCode={snapshot.corridor.code} machineLabel={machineLabel} crewLabel={crewLabel} />
        </FormSheet>
      </Modal>
    </>
  );
}

/* ── printable requisition body ─────────────────────────────── */
function RequisitionSheet({ block, payload, corridorCode, machineLabel, crewLabel }: { block: WorkingBlock; payload: Record<string, unknown>; corridorCode: string; machineLabel: (id: string) => string; crewLabel: (id: string) => string }) {
  const t = useT(blockStrings);
  const cell = { padding: '4px 8px', border: '1px solid #bbb', verticalAlign: 'top' as const, fontSize: 12 };
  return (
    <div className="stack" style={{ color: '#111' }}>
      <KeyValue
        items={[
          [t('reference'), <span className="mono">{block.id}</span>],
          [t('demandType'), String(payload.demandType ?? '')],
          [t('corridor'), corridorCode],
          [t('sections'), `${block.sectionText} · ${kmRange(block.startKm, block.endKm)}`],
          [t('line'), lineLabel(block.line)],
          [t('date'), dateLong(block.date)],
          [t('window'), `${hhmm(block.start)}–${hhmm(block.end)} · ${duration(block.spanMin)}`],
          ...(block.powerIsolation ? ([[t('powerIsolation'), block.powerIsolation]] as [React.ReactNode, React.ReactNode][]) : []),
          [t('machines'), block.machines.map(machineLabel).join(', ') || '—'],
          [t('gangs'), block.crews.map(crewLabel).join(', ') || '—'],
          [t('incharge'), block.approval?.incharge ?? '—'],
          [t('status'), block.status],
        ]}
      />
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={cell}>{t('department')}</th>
            <th style={cell}>{t('work')}</th>
            <th style={cell}>{t('window')}</th>
            <th style={cell}>ARCI</th>
          </tr>
        </thead>
        <tbody>
          {block.tasks.map((x) => (
            <tr key={x.id}>
              <td style={cell}>{DEPT_LABEL[x.dept].short}</td>
              <td style={cell}>{x.label} <span className="mono">({x.id})</span></td>
              <td style={cell} className="mono">{x.startText}–{x.endText}</td>
              <td style={cell} className="num">{x.arci.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small">{t('traffic')}: {block.affectedTrains.length} · {t('weightedDelay')}: {Math.round(block.weightedDelayMin)} {t('minutes')}</div>
      <div className="row" style={{ gap: 24, marginTop: 24 }}>
        <div className="grow" style={{ borderTop: '1px solid #111', paddingTop: 4, fontSize: 11 }}>{t('signature')}</div>
        <div className="grow" style={{ borderTop: '1px solid #111', paddingTop: 4, fontSize: 11 }}>{t('signatureControl')}</div>
      </div>
      <div className="tiny" style={{ color: '#666' }}>{t('plannedBy')}: {String(payload.plannedBy ?? '')}</div>
    </div>
  );
}

export default BlockDrawer;
