/**
 * FieldCautionPage — caution orders for today (Form T/409 / T/409B) as field
 * staff and loco pilots see them: issued orders can be acknowledged; drafts
 * are shown as not yet issued by Control. Orders come from cautionOrders()
 * over the register TSRs, today's machine blocks and the manual TSRs.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cautionOrders, workingBlocks, type CautionOrder } from '../../engine/select';
import type { RunLine } from '../../engine/types';
import { useT } from '../../i18n';
import { kmRange } from '../../lib/format';
import { Badge, EmptyState, PageHeader, PlanPending, Segmented, StatTile } from '../../components/ui';

type LineFilter = 'ALL' | RunLine;

const strings = {
  en: {
    title: 'Caution orders',
    lede: 'Temporary speed restrictions on this corridor today, in chainage order.',
    all: 'All lines',
    upLine: 'UP line',
    dnLine: 'DN line',
    statIssued: 'Issued today',
    statIssuedSub: '{n} more in draft',
    statLowest: 'Lowest speed',
    statLowestSub: 'Among issued orders',
    statAcked: 'Acknowledged by you',
    statAckedSub: 'of {n} issued',
    none: 'No caution order on this line today.',
    issued: 'Issued',
    draft: 'Draft — not issued by Control',
    ack: 'Acknowledge',
    acked: 'Acknowledged',
    ackAll: 'Acknowledge all issued ({n})',
    ackAllDone: 'All issued orders acknowledged',
    toastAck: 'Caution order {no} acknowledged',
    toastAckAll: '{n} caution orders acknowledged',
    mps: 'normal MPS {v} km/h',
    validity: '{from} to {to}',
    inForce: 'in force {n} d',
    lifting: 'Lifted by block {id}',
    note: 'View of the generated caution order, not the signed T/409 handed over at the station.',
  },
  hi: {
    title: 'सतर्कता आदेश',
    lede: 'आज इस कॉरिडोर पर अस्थायी गति प्रतिबंध, किलोमीटर क्रम में।',
    all: 'सभी लाइनें',
    upLine: 'UP लाइन',
    dnLine: 'DN लाइन',
    statIssued: 'आज जारी',
    statIssuedSub: '{n} और ड्राफ़्ट में',
    statLowest: 'न्यूनतम गति',
    statLowestSub: 'जारी आदेशों में',
    statAcked: 'आपके द्वारा पावती',
    statAckedSub: '{n} जारी में से',
    none: 'आज इस लाइन पर कोई सतर्कता आदेश नहीं।',
    issued: 'जारी',
    draft: 'ड्राफ़्ट — कंट्रोल ने जारी नहीं किया',
    ack: 'पावती दें',
    acked: 'पावती दी',
    ackAll: 'सभी जारी आदेशों की पावती ({n})',
    ackAllDone: 'सभी जारी आदेशों की पावती दी जा चुकी',
    toastAck: 'सतर्कता आदेश {no} की पावती दी',
    toastAckAll: '{n} सतर्कता आदेशों की पावती दी',
    mps: 'सामान्य MPS {v} km/h',
    validity: '{from} से {to}',
    inForce: '{n} दिन से लागू',
    lifting: 'ब्लॉक {id} से हटेगा',
    note: 'यह जनरेट किए गए सतर्कता आदेश का दृश्य है, स्टेशन पर दिया गया हस्ताक्षरित T/409 नहीं।',
  },
} as const;

const isIssued = (o: CautionOrder) => o.status === 'ISSUED' || o.status === 'RECEIVED' || o.status === 'ACKNOWLEDGED';

export default function FieldCautionPage() {
  const t = useT(strings);

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const tsrs = useAppStore((s) => s.tsrs);
  const forms = useAppStore((s) => s.forms);
  const acks = useAppStore((s) => s.acks);
  const ackCaution = useAppStore((s) => s.ackCaution);
  const notify = useAppStore((s) => s.notify);
  const toast = useAppStore((s) => s.toast);

  const [line, setLine] = useState<LineFilter>('ALL');

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const orders = useMemo(
    () => (snapshot ? cautionOrders(snapshot, blocks, tsrs, forms, 0).filter((o) => o.status !== 'WITHDRAWN').sort((a, b) => a.startKm - b.startKm) : []),
    [snapshot, blocks, tsrs, forms]
  );
  const shown = useMemo(() => (line === 'ALL' ? orders : orders.filter((o) => o.line === line || o.line === 'BOTH')), [orders, line]);

  if (!snapshot) return <PlanPending />;

  const ackBy = user?.name ?? 'Loco pilot';
  const ackedByMe = (orderNo: string) => acks.some((a) => a.orderNo === orderNo && a.by === ackBy);
  const issued = shown.filter(isIssued);
  const drafts = shown.length - issued.length;
  const lowest = issued.length ? Math.min(...issued.map((o) => o.speedKmph)) : null;
  const ackedCount = issued.filter((o) => ackedByMe(o.orderNo)).length;
  const pending = issued.filter((o) => !ackedByMe(o.orderNo));

  const doAck = (o: CautionOrder) => {
    ackCaution(o.orderNo);
    notify({ portals: ['control'], kind: 'OK', title: `Caution ${o.orderNo} acknowledged`, body: ackBy, route: '/app/control/caution' });
  };
  const onAck = (o: CautionOrder) => {
    doAck(o);
    toast({ title: t('toastAck', { no: o.orderNo }), tone: 'ok' });
  };
  const onAckAll = () => {
    if (!pending.length) return;
    for (const o of pending) doAck(o);
    toast({ title: t('toastAckAll', { n: pending.length }), tone: 'ok' });
  };

  return (
    <div className="stack-lg" data-tour="cautions">
      <PageHeader
        title={t('title')}
        lede={`${t('lede')} · ${snapshot.corridor.name}`}
        actions={
          <button type="button" className={`btn btn-lg ${pending.length ? 'btn-primary' : ''}`} style={{ minHeight: 48 }} disabled={!pending.length} onClick={onAckAll}>
            <CheckCircle2 /> {pending.length ? t('ackAll', { n: pending.length }) : t('ackAllDone')}
          </button>
        }
      />

      <Segmented<LineFilter>
        ariaLabel={t('title')}
        value={line}
        onChange={setLine}
        options={[
          { value: 'ALL', label: t('all') },
          { value: 'UP', label: t('upLine') },
          { value: 'DN', label: t('dnLine') },
        ]}
      />

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <StatTile label={t('statIssued')} value={issued.length} sub={drafts ? t('statIssuedSub', { n: drafts }) : undefined} />
        <StatTile label={t('statLowest')} value={lowest ?? '—'} unit={lowest !== null ? 'km/h' : undefined} sub={t('statLowestSub')} />
        <StatTile label={t('statAcked')} value={ackedCount} sub={t('statAckedSub', { n: issued.length })} />
      </div>

      {shown.length === 0 ? (
        <EmptyState title={t('none')} />
      ) : (
        <div className="stack">
          {shown.map((o) => {
            const iss = isIssued(o);
            const mine = ackedByMe(o.orderNo);
            return (
              <article key={o.id} className="card" style={iss ? undefined : { borderStyle: 'dashed' }}>
                <div className="card-body tight stack" style={{ gap: 6 }}>
                  <div className="row-wrap" style={{ gap: 6 }}>
                    <Badge tone="solid-crit">{o.speedKmph} km/h</Badge>
                    <span className="num strong">{kmRange(o.startKm, o.endKm)}</span>
                    <span className="small">{o.line}</span>
                    <span className="grow" />
                    <Badge tone={iss ? 'ok' : 'gray'}>{iss ? t('issued') : t('draft')}</Badge>
                  </div>
                  <div>{o.reason}</div>
                  <div className="small muted">
                    {o.section} · {o.formType} · {t('mps', { v: o.normalSpeedKmph })}
                  </div>
                  <div className="tiny muted">
                    <span className="mono">{o.orderNo}</span> · {t('validity', { from: o.validFrom, to: o.validTo })} · {t('inForce', { n: o.daysInForce })}
                    {o.liftingBlockId ? ` · ${t('lifting', { id: o.liftingBlockId })}` : ''}
                  </div>
                  {iss && (
                    <div>
                      {mine ? (
                        <Badge tone="ok" icon={<CheckCircle2 />}>{t('acked')}</Badge>
                      ) : (
                        <button type="button" className="btn btn-dark" style={{ minHeight: 44 }} onClick={() => onAck(o)}>
                          <CheckCircle2 /> {t('ack')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="row-wrap tiny muted">
        <AlertTriangle size={14} />
        <span>{t('note')}</span>
      </p>
    </div>
  );
}
