/**
 * Corridor switch with a confirmation that states what the switch clears
 * (store.corridorSwitchImpact()). Approvals, execution records, forms,
 * power-block records, extensions, handover notes, the scenario and pins /
 * closures belong to the corridor being left; the store clears them, audits
 * the switch and re-plans. Used by the shell, the Control board, the
 * division brief and the admin page.
 */
import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { CORRIDORS } from '../../engine/corridors.js';
import type { Corridor } from '../../engine/types';
import { useAppStore, type CorridorSwitchImpact } from '../../store/useAppStore';
import { useT } from '../../i18n';
import { Callout, Modal } from '../ui';

const strings = {
  en: {
    title: 'Switch corridor',
    body: 'Switch from {from} to {to}? The plan is recomputed for {to}.',
    clears: 'These records belong to {from} and will be cleared on this device:',
    nothing: 'Nothing recorded on {from} will be cleared — no approvals, execution records or forms yet.',
    approvals: '{n} block approval record(s), {sent} sent or held, {granted} granted or locked',
    execution: '{n} possession record(s) in the execution log',
    forms: '{n} caution / disconnection form record(s)',
    power: '{n} OHE power-block record(s)',
    extensions: '{n} extension request(s)',
    handover: '{n} handover note(s)',
    scenario: 'The active what-if scenario',
    machines: '{n} machine removal(s) in that scenario',
    pinned: '{n} pinned work(s)',
    excluded: '{n} closed work(s)',
    keep: 'Requisitions, hazard reports, TSRs and the audit trail are kept.',
    cancel: 'Cancel',
    confirm: 'Switch to {to}',
    switched: 'Corridor changed to {name}',
    switchedBody: 'The plan is being recomputed for this corridor.',
  },
  hi: {
    title: 'कॉरिडोर बदलें',
    body: '{from} से {to} पर जाएँ? {to} के लिए योजना फिर से बनेगी।',
    clears: 'ये रिकॉर्ड {from} के हैं और इस डिवाइस पर हटा दिए जाएँगे:',
    nothing: '{from} पर दर्ज कुछ भी नहीं हटेगा — अभी कोई स्वीकृति, निष्पादन रिकॉर्ड या फ़ॉर्म नहीं।',
    approvals: '{n} block स्वीकृति रिकॉर्ड, {sent} भेजे या रोके गए, {granted} प्रदत्त या लॉक',
    execution: 'निष्पादन लॉग में {n} पज़ेशन रिकॉर्ड',
    forms: '{n} सतर्कता / डिस्कनेक्शन फ़ॉर्म रिकॉर्ड',
    power: '{n} OHE पावर block रिकॉर्ड',
    extensions: '{n} विस्तार अनुरोध',
    handover: '{n} हैंडओवर नोट',
    scenario: 'सक्रिय what-if परिदृश्य',
    machines: 'उस परिदृश्य में {n} मशीन हटाव',
    pinned: '{n} पिन किए कार्य',
    excluded: '{n} बंद किए कार्य',
    keep: 'माँग-पत्र, खतरा रिपोर्ट, TSR और ऑडिट ट्रेल बने रहते हैं।',
    cancel: 'रद्द करें',
    confirm: '{to} पर जाएँ',
    switched: 'कॉरिडोर बदलकर {name} किया गया',
    switchedBody: 'इस कॉरिडोर के लिए योजना फिर से बन रही है।',
  },
} as const;

const LIST = CORRIDORS as Corridor[];
const nameOf = (id: string) => {
  const c = LIST.find((x) => x.id === id);
  return c ? `${c.name} (${c.code})` : id;
};

type Tf = (key: keyof typeof strings.en, vars?: Record<string, string | number>) => string;

function impactLines(i: CorridorSwitchImpact, t: Tf): string[] {
  const out: string[] = [];
  if (i.approvals) out.push(t('approvals', { n: i.approvals, sent: i.sentOrHeld, granted: i.granted }));
  if (i.executionRecords) out.push(t('execution', { n: i.executionRecords }));
  if (i.forms) out.push(t('forms', { n: i.forms }));
  if (i.powerBlocks) out.push(t('power', { n: i.powerBlocks }));
  if (i.extensions) out.push(t('extensions', { n: i.extensions }));
  if (i.handoverNotes) out.push(t('handover', { n: i.handoverNotes }));
  if (i.scenario) out.push(t('scenario'));
  if (i.machineRemovals) out.push(t('machines', { n: i.machineRemovals }));
  if (i.pinned) out.push(t('pinned', { n: i.pinned }));
  if (i.excluded) out.push(t('excluded', { n: i.excluded }));
  return out;
}

export function CorridorSwitchDialog({ target, onClose }: { target: string; onClose: () => void }) {
  const t = useT(strings);
  const corridorId = useAppStore((s) => s.corridorId);
  const setCorridor = useAppStore((s) => s.setCorridor);
  const impactFn = useAppStore((s) => s.corridorSwitchImpact);
  const toast = useAppStore((s) => s.toast);
  // read once when the dialog opens: it describes the state being left
  const [impact] = useState(() => impactFn());
  const lines = impactLines(impact, t);
  const from = nameOf(corridorId);
  const to = nameOf(target);

  const confirm = () => {
    setCorridor(target);
    toast({ title: t('switched', { name: to }), body: t('switchedBody'), tone: 'info' });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('title')}
      width={520}
      footer={
        <div className="row-wrap" style={{ width: '100%', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={confirm} autoFocus>
            <ArrowRightLeft size={14} /> {t('confirm', { to })}
          </button>
        </div>
      }
    >
      <div className="stack">
        <div className="small">{t('body', { from, to })}</div>
        {lines.length ? (
          <Callout tone="warn">
            <div className="small strong">{t('clears', { from })}</div>
            <ul className="small" style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Callout>
        ) : (
          <Callout tone="ok">{t('nothing', { from })}</Callout>
        )}
        <div className="tiny muted">{t('keep')}</div>
      </div>
    </Modal>
  );
}

export default CorridorSwitchDialog;
