/**
 * Execution deviations for Control: extension requests from site with the
 * delay impact of the extra minutes (select.evaluateBlockWindow on the
 * extended window) and Approve / Refuse (store.decideExtension); possessions
 * running past their planned end (select.blocksRunningPastEnd); the site
 * message thread of a block with a reply box (select.messagesForBlock,
 * store.replyToMessage); loco-pilot acknowledgement counts of caution orders.
 * Guarded store actions toast their own refusal; success toasts only on true.
 */
import { useMemo, useState } from 'react';
import { Check, Clock, MessageSquare, Send, X } from 'lucide-react';
import { can } from '../../auth/portals';
import { usePortal } from '../../app/usePortal';
import { acksForOrder, evaluateBlockWindow, messagesForBlock, type CautionOrder, type RunningLate, type WorkingBlock } from '../../engine/select';
import type { Snapshot } from '../../engine/types';
import { useAppStore, type ExtensionRequest } from '../../store/useAppStore';
import { useT } from '../../i18n';
import { dateLabel, duration, hhmm, signed, timeAgo } from '../../lib/format';
import { Badge, Callout } from '../ui';
import { SimLabel } from '../ui/extras';
import { useDrawerParams } from './useDrawerParams';

const strings = {
  en: {
    extTitle: 'Extension requests',
    extNone: 'No extension request is waiting for Control.',
    extRow: '+{min} min to {end} · {reason}',
    extRowDecided: '+{min} min · {reason}',
    extBy: '{by} · {when}',
    extImpact: 'If approved: {trains} train(s) affected ({dTrains}), weighted delay {delay} min ({dDelay}).',
    extViolations: 'Rules the extended window breaks: {list}',
    extNoViolations: 'The extended window breaks no JPO rule.',
    extNote: 'Note to site (optional)',
    approve: 'Approve',
    refuse: 'Refuse',
    extApproved: 'Extension approved · {id}',
    extApprovedBody: 'Block now ends {end} (+{min} min)',
    extRefused: 'Extension refused · {id}',
    extRefusedBody: 'Site told to clear by {end}',
    extNoCap: 'Only Control can decide an extension.',
    extDecided: '{status} by {by} · {when}',
    st_APPROVED: 'Approved',
    st_REFUSED: 'Refused',
    st_PENDING: 'Pending',
    lateTitle: 'Running past planned end',
    lateNone: 'No possession in progress is past its planned end at {time}.',
    lateRow: '{section} · planned end {end} · {over} over',
    lateBadge: 'Running {over} past end',
    msgTitle: 'Site messages',
    msgNone: 'No message from site on this block.',
    msgField: 'Site',
    msgControl: 'Control',
    reply: 'Reply',
    replyPlaceholder: 'Reply to the site in-charge',
    replySent: 'Reply sent to site · {id}',
    replyNoCap: 'Only Control can reply to site messages.',
    replyNoMessage: 'A reply needs a message from site first.',
    acksTitle: 'Loco pilot acknowledgements',
    acksNone: 'No caution order issued for these blocks yet.',
    acksRow: '{no} · {speed} km/h · {n} acknowledgement(s)',
    acksLast: 'last {by} · {when}',
    acksNotIssued: '{no} · not issued',
    open: 'Open',
  },
  hi: {
    extTitle: 'विस्तार अनुरोध',
    extNone: 'कोई विस्तार अनुरोध नियंत्रण की प्रतीक्षा में नहीं।',
    extRow: '+{min} मिनट, {end} तक · {reason}',
    extRowDecided: '+{min} मिनट · {reason}',
    extBy: '{by} · {when}',
    extImpact: 'स्वीकृत होने पर: {trains} ट्रेन प्रभावित ({dTrains}), भारित विलंब {delay} मिनट ({dDelay})।',
    extViolations: 'विस्तारित खिड़की ये नियम तोड़ती है: {list}',
    extNoViolations: 'विस्तारित खिड़की कोई JPO नियम नहीं तोड़ती।',
    extNote: 'साइट के लिए टिप्पणी (वैकल्पिक)',
    approve: 'स्वीकृत करें',
    refuse: 'अस्वीकार',
    extApproved: 'विस्तार स्वीकृत · {id}',
    extApprovedBody: 'block अब {end} पर समाप्त (+{min} मिनट)',
    extRefused: 'विस्तार अस्वीकृत · {id}',
    extRefusedBody: 'साइट को {end} तक क्लियर करने को कहा गया',
    extNoCap: 'विस्तार का निर्णय केवल नियंत्रण कर सकता है।',
    extDecided: '{by} द्वारा {status} · {when}',
    st_APPROVED: 'स्वीकृत',
    st_REFUSED: 'अस्वीकृत',
    st_PENDING: 'लंबित',
    lateTitle: 'नियोजित समाप्ति के बाद भी जारी',
    lateNone: '{time} पर कोई जारी पज़ेशन अपनी नियोजित समाप्ति से आगे नहीं।',
    lateRow: '{section} · नियोजित समाप्ति {end} · {over} अधिक',
    lateBadge: 'समाप्ति से {over} अधिक',
    msgTitle: 'साइट संदेश',
    msgNone: 'इस block पर साइट से कोई संदेश नहीं।',
    msgField: 'साइट',
    msgControl: 'नियंत्रण',
    reply: 'उत्तर दें',
    replyPlaceholder: 'साइट प्रभारी को उत्तर',
    replySent: 'साइट को उत्तर भेजा · {id}',
    replyNoCap: 'साइट संदेशों का उत्तर केवल नियंत्रण दे सकता है।',
    replyNoMessage: 'उत्तर के लिए पहले साइट का संदेश चाहिए।',
    acksTitle: 'लोको पायलट पावती',
    acksNone: 'इन block के लिए अभी कोई सतर्कता आदेश जारी नहीं।',
    acksRow: '{no} · {speed} किमी/घं · {n} पावती',
    acksLast: 'अंतिम {by} · {when}',
    acksNotIssued: '{no} · जारी नहीं',
    open: 'खोलें',
  },
} as const;

/* ── extension requests ─────────────────────────────────────────── */

export function ExtensionRequests({ snapshot, blocks, blockId, showDecided = false }: { snapshot: Snapshot; blocks: WorkingBlock[]; blockId?: string; showDecided?: boolean }) {
  const t = useT(strings);
  const extensions = useAppStore((s) => s.extensions);
  const list = useMemo(() => {
    const ids = new Set(blocks.map((b) => b.id));
    return extensions.filter((e) => (blockId ? e.blockId === blockId : ids.has(e.blockId)) && (showDecided || e.status === 'PENDING'));
  }, [extensions, blocks, blockId, showDecided]);
  if (!list.length) return <div className="small muted">{t('extNone')}</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {list.map((e) => {
        const b = blocks.find((x) => x.id === e.blockId);
        return b ? <ExtensionRow key={e.id} snapshot={snapshot} block={b} blocks={blocks} req={e} /> : null;
      })}
    </div>
  );
}

function ExtensionRow({ snapshot, block, blocks, req }: { snapshot: Snapshot; block: WorkingBlock; blocks: WorkingBlock[]; req: ExtensionRequest }) {
  const t = useT(strings);
  const drawer = useDrawerParams();
  const user = useAppStore((s) => s.user);
  const decide = useAppStore((s) => s.decideExtension);
  const toast = useAppStore((s) => s.toast);
  const [note, setNote] = useState('');
  const canDecide = can(user, 'grant');
  const pending = req.status === 'PENDING';
  const newEnd = block.end + req.extraMin;
  const impact = useMemo(() => {
    if (!pending) return null;
    const now = evaluateBlockWindow(snapshot, block, block.start, block.end, blocks);
    const ext = evaluateBlockWindow(snapshot, block, block.start, Math.min(1440, newEnd), blocks);
    return { now, ext };
  }, [pending, snapshot, block, blocks, newEnd]);

  const act = (approve: boolean) => {
    const ok = decide(block.id, req.id, approve, note.trim() || undefined);
    if (!ok) return;
    if (approve) toast({ title: t('extApproved', { id: block.id }), body: t('extApprovedBody', { end: hhmm(newEnd), min: req.extraMin }), tone: 'ok' });
    else toast({ title: t('extRefused', { id: block.id }), body: t('extRefusedBody', { end: hhmm(block.end) }), tone: 'warn' });
    setNote('');
  };

  return (
    <div className="well stack" style={{ gap: 6 }}>
      <div className="row-wrap" style={{ gap: 6 }}>
        <button type="button" className="btn btn-sm btn-ghost mono" onClick={() => drawer.open('block', block.id, { close: 'task' })}>{block.id}</button>
        <span className="small strong grow">{pending ? t('extRow', { min: req.extraMin, end: hhmm(newEnd), reason: req.reason }) : t('extRowDecided', { min: req.extraMin, reason: req.reason })}</span>
        <Badge tone={req.status === 'PENDING' ? 'warn' : req.status === 'APPROVED' ? 'ok' : 'crit'}>{t(`st_${req.status}` as const)}</Badge>
      </div>
      <div className="tiny muted">
        {block.sectionText} · {dateLabel(block.date)} {hhmm(block.start)}–{hhmm(block.end)} · {t('extBy', { by: req.by, when: timeAgo(req.at) })}
      </div>
      {impact && (
        <>
          <div className="small">
            {t('extImpact', {
              trains: impact.ext.trains.length,
              dTrains: signed(impact.ext.trains.length - impact.now.trains.length),
              delay: Math.round(impact.ext.weightedDelayMin),
              dDelay: signed(Math.round(impact.ext.weightedDelayMin - impact.now.weightedDelayMin)),
            })}{' '}
            <SimLabel kind="wttPositions" short />
          </div>
          {impact.ext.ruleViolations.length ? <Callout tone="warn"><span className="small">{t('extViolations', { list: impact.ext.ruleViolations.join('; ') })}</span></Callout> : <div className="tiny muted">{t('extNoViolations')}</div>}
          <div className="row-wrap" style={{ gap: 6 }}>
            <input className="input" style={{ maxWidth: 280 }} value={note} placeholder={t('extNote')} aria-label={t('extNote')} onChange={(e) => setNote(e.target.value)} disabled={!canDecide} />
            <button type="button" className="btn btn-sm btn-ok" disabled={!canDecide} title={canDecide ? undefined : t('extNoCap')} onClick={() => act(true)}>
              <Check size={13} /> {t('approve')}
            </button>
            <button type="button" className="btn btn-sm btn-danger" disabled={!canDecide} title={canDecide ? undefined : t('extNoCap')} onClick={() => act(false)}>
              <X size={13} /> {t('refuse')}
            </button>
          </div>
          {!canDecide && <div className="tiny muted">{t('extNoCap')}</div>}
        </>
      )}
      {!pending && req.decidedBy && <div className="tiny muted">{t('extDecided', { status: t(`st_${req.status}` as const), by: req.decidedBy, when: req.decidedAt ? timeAgo(req.decidedAt) : '' })}{req.note ? ` · ${req.note}` : ''}</div>}
    </div>
  );
}

/* ── possessions past their planned end ─────────────────────────── */

export function RunningPastEndList({ late, minute }: { late: RunningLate[]; minute: number }) {
  const t = useT(strings);
  const drawer = useDrawerParams();
  if (!late.length) return <div className="small muted">{t('lateNone', { time: hhmm(minute) })}</div>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {late.map((r) => (
        <button key={r.block.id} type="button" className="well row" style={{ textAlign: 'left', gap: 8, width: '100%' }} onClick={() => drawer.open('block', r.block.id, { close: 'task' })}>
          <Clock size={14} style={{ color: 'var(--crit)', flex: 'none' }} />
          <span className="grow small">
            <span className="mono strong">{r.block.id}</span> · {t('lateRow', { section: r.block.sectionText, end: hhmm(r.block.end), over: duration(r.overMin) })}
          </span>
          <Badge tone="crit">{t('lateBadge', { over: duration(r.overMin) })}</Badge>
        </button>
      ))}
    </div>
  );
}

export function RunningLateBadge({ overMin }: { overMin: number }) {
  const t = useT(strings);
  return <Badge tone="crit" icon={<Clock size={12} />}>{t('lateBadge', { over: duration(overMin) })}</Badge>;
}

/* ── site message thread ────────────────────────────────────────── */

export function MessageThread({ blockId }: { blockId: string }) {
  const t = useT(strings);
  const portal = usePortal();
  const user = useAppStore((s) => s.user);
  const messages = useAppStore((s) => s.messages);
  const reply = useAppStore((s) => s.replyToMessage);
  const toast = useAppStore((s) => s.toast);
  const [text, setText] = useState('');
  const thread = useMemo(() => messagesForBlock(messages, blockId), [messages, blockId]);
  const lastField = [...thread].reverse().find((m) => m.from !== 'control') ?? null;
  const canReply = can(user, 'grant') || portal === 'control';

  const send = () => {
    if (!lastField) return;
    if (reply(lastField.id, text)) {
      toast({ title: t('replySent', { id: blockId }), body: text.trim().slice(0, 80), tone: 'ok' });
      setText('');
    }
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      {thread.length === 0 ? (
        <div className="small muted">{t('msgNone')}</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack">
          {thread.map((m) => {
            const mine = m.from === 'control';
            return (
              <li key={m.id} className="well" style={{ padding: '8px 10px', marginLeft: mine ? 24 : 0, marginRight: mine ? 0 : 24, background: mine ? 'var(--pastel-lavender)' : undefined }}>
                <div className="row tiny muted" style={{ gap: 6 }}>
                  <MessageSquare size={12} />
                  <span className="strong">{mine ? t('msgControl') : t('msgField')}</span>
                  <span className="grow truncate">{m.by}{m.role ? ` · ${m.role.replace(/_/g, ' ').toLowerCase()}` : ''}</span>
                  <span>{timeAgo(m.at)}</span>
                </div>
                <div className="small" style={{ marginTop: 2 }}>{m.text}</div>
              </li>
            );
          })}
        </ul>
      )}
      {canReply ? (
        lastField ? (
          <div className="row-wrap" style={{ gap: 6 }}>
            <input className="input grow" style={{ minWidth: 180 }} value={text} placeholder={t('replyPlaceholder')} aria-label={t('replyPlaceholder')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) send(); }} />
            <button type="button" className="btn btn-sm btn-dark" disabled={!text.trim()} onClick={send}>
              <Send size={13} /> {t('reply')}
            </button>
          </div>
        ) : null
      ) : (
        thread.length > 0 && <div className="tiny muted">{t('replyNoCap')}</div>
      )}
    </div>
  );
}

/* ── loco pilot acknowledgements of caution orders ──────────────── */

export function AckCounts({ orders }: { orders: CautionOrder[] }) {
  const t = useT(strings);
  const acks = useAppStore((s) => s.acks);
  if (!orders.length) return <div className="small muted">{t('acksNone')}</div>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack">
      {orders.map((o) => {
        const issued = o.status === 'ISSUED' || o.status === 'ACKNOWLEDGED';
        const list = acksForOrder(acks, o.orderNo);
        const last = list[list.length - 1];
        const n = Math.max(o.ackCount ?? 0, list.length);
        return (
          <li key={o.id} className="row-wrap small" style={{ gap: 6 }}>
            <Badge tone={issued ? (n > 0 ? 'ok' : 'warn') : 'gray'}>{o.formType}</Badge>
            <span className="grow">{issued ? t('acksRow', { no: o.orderNo, speed: o.speedKmph, n }) : t('acksNotIssued', { no: o.orderNo })}</span>
            {issued && last && <span className="tiny muted">{t('acksLast', { by: `${last.by}${last.trainNo ? ` (${last.trainNo})` : ''}`, when: timeAgo(last.at) })}</span>}
          </li>
        );
      })}
    </ul>
  );
}
