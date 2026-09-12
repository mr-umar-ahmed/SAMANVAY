/**
 * Proposals changed by a re-plan after they were sent (select.supersededProposals):
 * what was sent (day, window, works), when the re-plan changed it, and the
 * block of the current plan that now holds the same works, with "Send again"
 * (store.proposeBlocks on the replacement, which also retires the superseded
 * record). Granted / locked blocks the new plan no longer contains are listed
 * too — they need Control's attention as well as a new proposal.
 */
import { ExternalLink, RotateCcw, Send } from 'lucide-react';
import { can, type PortalId } from '../../auth/portals';
import type { WorkingBlock } from '../../engine/select';
import type { Dept, Snapshot } from '../../engine/types';
import { useAppStore } from '../../store/useAppStore';
import { useT } from '../../i18n';
import { dateLabel, hhmm, timeAgo } from '../../lib/format';
import { Badge, Callout } from '../ui';
import { useDrawerParams } from './useDrawerParams';
import { useSupersededRows } from './planHooks';

const strings = {
  en: {
    none: 'No sent proposal has been changed by a re-plan.',
    lede: '{n} sent block(s) changed by a re-plan. Departments concurred on the old window, so the new block must be sent again.',
    sent: 'Sent: {when} {window} · {works} work(s) · {status}',
    changed: 'Changed by the re-plan {ago}',
    reasonProposal: 'The re-plan moved or regrouped these works, so the concurrence asked for no longer matches a block.',
    reasonHeld: 'This {status} block is not in the new plan — Control has been alerted. Send the replacement for concurrence.',
    now: 'Now in {block}: {when} {window} · {state}',
    nowNone: 'These works are not scheduled in the current plan.',
    nowSplit: 'The works are now spread over {n} blocks.',
    sendAgain: 'Send again',
    sendAll: 'Send all replacements ({n})',
    sendNoCap: 'Only the block planning cell can send blocks.',
    alreadySent: 'Replacement already sent ({state}).',
    sentToast: '{n} replacement block(s) sent to Control',
    sentToastBody: 'Replaces {old}',
    notifyControl: '{n} replacement block(s) proposed',
    notifyDept: 'Concurrence requested again on {n} block(s)',
    notifyBody: 'Re-plan changed the blocks you concurred on; please concur on the new window.',
    open: 'Open',
    st_DRAFT: 'draft',
    st_PROPOSED: 'awaiting concurrence',
    st_CONCURRED: 'concurred',
    st_GRANTED: 'granted',
    st_LOCKED: 'locked',
    st_REFUSED: 'refused',
    st_SUPERSEDED: 'changed by re-plan',
  },
  hi: {
    none: 'भेजा गया कोई प्रस्ताव पुनः योजना से नहीं बदला।',
    lede: 'पुनः योजना से {n} भेजे गए block बदले। विभागों ने पुरानी खिड़की पर सहमति दी थी, इसलिए नया block फिर से भेजना होगा।',
    sent: 'भेजा गया: {when} {window} · {works} कार्य · {status}',
    changed: 'पुनः योजना से बदला {ago}',
    reasonProposal: 'पुनः योजना ने इन कार्यों को खिसकाया या फिर से समूहित किया, इसलिए माँगी गई सहमति अब किसी block से मेल नहीं खाती।',
    reasonHeld: 'यह {status} block नई योजना में नहीं है — नियंत्रण को सूचित किया गया। विकल्प block सहमति हेतु भेजें।',
    now: 'अब {block} में: {when} {window} · {state}',
    nowNone: 'ये कार्य वर्तमान योजना में नियोजित नहीं हैं।',
    nowSplit: 'कार्य अब {n} block में बँटे हैं।',
    sendAgain: 'फिर से भेजें',
    sendAll: 'सभी विकल्प भेजें ({n})',
    sendNoCap: 'block केवल ब्लॉक योजना प्रकोष्ठ भेज सकता है।',
    alreadySent: 'विकल्प पहले ही भेजा गया ({state})।',
    sentToast: '{n} विकल्प block नियंत्रण को भेजे गए',
    sentToastBody: '{old} के स्थान पर',
    notifyControl: '{n} विकल्प block प्रस्तावित',
    notifyDept: '{n} block पर फिर से सहमति माँगी गई',
    notifyBody: 'पुनः योजना ने आपकी सहमति वाले block बदले; नई खिड़की पर सहमति दें।',
    open: 'खोलें',
    st_DRAFT: 'ड्राफ़्ट',
    st_PROPOSED: 'सहमति की प्रतीक्षा में',
    st_CONCURRED: 'सहमत',
    st_GRANTED: 'प्रदत्त',
    st_LOCKED: 'लॉक',
    st_REFUSED: 'अस्वीकृत',
    st_SUPERSEDED: 'पुनः योजना से बदला',
  },
} as const;

const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];

export function SupersededList({ snapshot, blocks, tour }: { snapshot: Snapshot; blocks: WorkingBlock[]; tour?: string }) {
  const t = useT(strings);
  const drawer = useDrawerParams();
  const user = useAppStore((s) => s.user);
  const proposeBlocks = useAppStore((s) => s.proposeBlocks);
  const notify = useAppStore((s) => s.notify);
  const toast = useAppStore((s) => s.toast);
  const rows = useSupersededRows(snapshot, blocks);
  const canPlan = can(user, 'plan');
  const allSendable = [...new Map(rows.flatMap((r) => r.sendable).map((b) => [b.id, b])).values()];

  const send = (list: WorkingBlock[], old: string[]) => {
    if (!canPlan || !list.length) return;
    const n = proposeBlocks(list.map((b) => b.id));
    if (!n) return;
    const depts = DEPTS.filter((d) => list.some((b) => b.departments.includes(d)));
    notify({ portals: ['control'], kind: 'ACTION', title: t('notifyControl', { n }), body: old.join(', '), route: '/app/control/handoff' });
    for (const d of depts) notify({ portals: [d.toLowerCase() as PortalId], dept: d, kind: 'ACTION', title: t('notifyDept', { n: list.filter((b) => b.departments.includes(d)).length }), body: t('notifyBody'), route: `/app/${d.toLowerCase()}/blocks` });
    toast({ title: t('sentToast', { n }), body: t('sentToastBody', { old: old.join(', ') }), tone: 'ok' });
  };

  if (!rows.length) return <div className="small muted" data-tour={tour}>{t('none')}</div>;

  return (
    <div className="stack" data-tour={tour}>
      <Callout tone="warn" icon={<RotateCcw />}>
        <div className="row-wrap" style={{ gap: 8 }}>
          <span className="small grow">{t('lede', { n: rows.length })}</span>
          {allSendable.length > 1 && (
            <button type="button" className="btn btn-sm btn-dark" disabled={!canPlan} title={canPlan ? undefined : t('sendNoCap')} onClick={() => send(allSendable, rows.map((r) => r.blockId))}>
              <Send size={13} /> {t('sendAll', { n: allSendable.length })}
            </button>
          )}
        </div>
      </Callout>
      {rows.map((r) => {
        const win = r.start !== null && r.end !== null ? `${hhmm(r.start)}–${hhmm(r.end)}` : '';
        const statusWord = t(`st_${r.held ? r.status : 'PROPOSED'}` as 'st_PROPOSED');
        return (
          <div key={r.blockId} className="well stack" style={{ gap: 6 }}>
            <div className="row-wrap" style={{ gap: 6 }}>
              <span className="mono strong small">{r.blockId}</span>
              <Badge tone={r.held ? 'crit' : 'warn'}>{t(r.held ? `st_${r.status}` as 'st_GRANTED' : 'st_SUPERSEDED')}</Badge>
              {r.supersededAt && <span className="tiny muted">{t('changed', { ago: timeAgo(r.supersededAt) })}</span>}
            </div>
            <div className="tiny muted">{t('sent', { when: r.date ? dateLabel(r.date) : '', window: win, works: r.works, status: statusWord })}</div>
            <div className="small">{r.held ? t('reasonHeld', { status: statusWord }) : t('reasonProposal')}</div>
            {r.now.length === 0 ? (
              <div className="small muted">{t('nowNone')}</div>
            ) : (
              <>
                {r.now.length > 1 && <div className="tiny muted">{t('nowSplit', { n: r.now.length })}</div>}
                {r.now.map((b) => {
                  const ok = r.sendable.some((x) => x.id === b.id);
                  return (
                    <div key={b.id} className="row-wrap" style={{ gap: 6 }}>
                      <span className="small grow">{t('now', { block: b.id, when: dateLabel(b.date), window: `${b.startText}–${b.endText}`, state: t(`st_${b.state}` as 'st_DRAFT') })}</span>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => drawer.open('block', b.id, { close: 'task' })}>
                        <ExternalLink size={12} /> {t('open')}
                      </button>
                      {ok ? (
                        <button type="button" className="btn btn-sm btn-primary" disabled={!canPlan} title={canPlan ? undefined : t('sendNoCap')} onClick={() => send([b], [r.blockId])}>
                          <Send size={12} /> {t('sendAgain')}
                        </button>
                      ) : (
                        <span className="tiny muted">{t('alreadySent', { state: t(`st_${b.state}` as 'st_DRAFT') })}</span>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SupersededList;
