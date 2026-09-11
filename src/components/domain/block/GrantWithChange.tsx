/**
 * "Grant with change" — Control shifts or shortens the proposed window and
 * sees the delay model + JPO rule checks re-evaluated live before confirming.
 */
import { useMemo, useState } from 'react';
import { Badge, Callout, KeyValue, Modal } from '../../ui';
import { evaluateBlockWindow, type WorkingBlock } from '../../../engine/select';
import type { Snapshot } from '../../../engine/types';
import { hhmm, duration } from '../../../lib/format';
import { useT } from '../../../i18n';
import { blockStrings } from './strings';

const SHIFTS = [-60, -30, -15, 0, 15, 30, 60];

export function GrantWithChange({ open, onClose, snapshot, block, others, t351Pending, onConfirm }: { open: boolean; onClose: () => void; snapshot: Snapshot; block: WorkingBlock; others: WorkingBlock[]; t351Pending: boolean; onConfirm: (start: number, end: number) => void }) {
  const t = useT(blockStrings);
  const [shift, setShift] = useState(0);
  const [shorten, setShorten] = useState<number | ''>('');
  const [ack, setAck] = useState(false);

  const start = block.start + shift;
  const span = shorten === '' ? block.spanMin : Math.max(0, Math.min(block.spanMin, Math.round(shorten)));
  const end = start + span;
  const ev = useMemo(() => evaluateBlockWindow(snapshot, block, start, end, others), [snapshot, block, start, end, others]);
  const changed = shift !== 0 || span !== block.spanMin;
  const blocked = !ev.feasible || !changed || (t351Pending && !ack);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('grantWithChange')}
      width={560}
      footer={
        <div className="row-wrap" style={{ width: '100%' }}>
          <span className="small muted grow">{!changed ? `${t('shift')} / ${t('shortenTo')}` : !ev.feasible ? t('infeasible') : ''}</span>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" disabled={blocked} onClick={() => onConfirm(start, end)}>{t('confirm')}</button>
        </div>
      }
    >
      <div className="stack-lg">
        <div className="field">
          <label>{t('shift')}</label>
          <div className="seg" role="group" aria-label={t('shift')}>
            {SHIFTS.map((s) => (
              <button key={s} aria-pressed={shift === s} onClick={() => setShift(s)}>
                {s === 0 ? '0' : `${s > 0 ? '+' : '−'}${Math.abs(s)}`}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{t('shortenTo')}</label>
          <input className="input" type="number" min={0} max={block.spanMin} step={5} value={shorten} placeholder={String(block.spanMin)} onChange={(e) => setShorten(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <KeyValue
          items={[
            [t('newWindow'), <span className="mono num">{hhmm(start)}–{hhmm(end)} · {duration(span)}</span>],
            [t('affected'), <span className="num">{ev.trains.length}</span>],
            [t('weightedDelay'), <span className="num">{Math.round(ev.weightedDelayMin)} {t('minutes')}</span>],
          ]}
        />
        {ev.trains.length > 0 && (
          <div className="row-wrap">
            {ev.trains.slice(0, 12).map((tr) => (
              <Badge key={tr.trainId} tone={tr.premium ? 'crit' : 'outline'} title={tr.name}>
                <span className="mono">{tr.number}</span> · {tr.mode} · <span className="num">{Math.round(tr.delayMin)} {t('minutes')}</span>
              </Badge>
            ))}
            {ev.trains.length > 12 && <span className="tiny muted">+{ev.trains.length - 12}</span>}
          </div>
        )}
        {ev.ruleViolations.length ? (
          <Callout tone="crit">
            <b>{t('violations')}</b>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {ev.ruleViolations.map((v) => (
                <li key={v} className="small">{v}</li>
              ))}
            </ul>
          </Callout>
        ) : (
          <Callout tone="ok">{t('noViolations')}</Callout>
        )}
        {t351Pending && (
          <Callout tone="warn">
            <div className="strong">{t('t351Warning')}</div>
            <label className="check mt">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span className="small">{t('t351Confirm')}</span>
            </label>
          </Callout>
        )}
      </div>
    </Modal>
  );
}
