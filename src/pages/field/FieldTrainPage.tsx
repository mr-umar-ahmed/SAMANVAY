/**
 * FieldTrainPage — the loco pilot's run on this corridor: every block section
 * in running order with its timetabled passage, the caution orders that apply
 * to the train (issued orders can be acknowledged) and the blocks it meets
 * today with the delay model's regulation. Train remembered in settings.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Train as TrainIcon } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { blocksMetByTrain, cautionOrders, workingBlocks, type CautionOrder, type WorkingBlock } from '../../engine/select';
import type { AffectedTrain, Train } from '../../engine/types';
import { useT } from '../../i18n';
import { hhmm, kmRange } from '../../lib/format';
import { Badge, Card, CardBody, CardHead, EmptyState, PageHeader, PlanPending, StatTile } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';

const strings = {
  en: {
    title: 'My train',
    lede: 'Your run on this corridor with caution orders and blocks in running order.',
    trainNo: 'Train number',
    show: 'Show',
    enter: 'Enter your train number.',
    notFound: 'No train {no} in this corridor’s timetable.',
    line: 'Line',
    entry: 'Enters corridor',
    exit: 'Leaves corridor',
    mps: 'Sectional MPS',
    cautions: 'Caution orders on route',
    cautionsSub: '{n} issued',
    blocksToday: 'Blocks met today',
    run: 'Run in running order',
    runSub: 'Timetabled passage through each block section',
    tsr: 'TSR {v} km/h',
    blockAt: 'Block {window}',
    orders: 'Caution orders in running order',
    ordersNone: 'No caution order on your route today.',
    issued: 'Issued',
    draft: 'Draft — not issued by Control',
    ack: 'Acknowledge',
    acked: 'Acknowledged',
    toastAck: 'Caution order {no} acknowledged',
    blocks: 'Blocks on your route today',
    blocksNone: 'No block on your route today.',
    held: '{mode}, about {n} min',
    noHold: 'Passes during the window; no hold computed',
    modeSLW: 'Single-line working',
    modeHELD: 'Held',
    modeREGULATED: 'Regulated',
    granted: 'Granted',
    locked: 'Locked',
    awaiting: 'Awaiting Control',
    inForce: 'in force {n} d',
    note: 'View of the generated caution order, not the signed T/409 handed over at the station.',
  },
  hi: {
    title: 'मेरी ट्रेन',
    lede: 'इस कॉरिडोर पर आपकी यात्रा, सतर्कता आदेश और ब्लॉक चलने के क्रम में।',
    trainNo: 'ट्रेन संख्या',
    show: 'दिखाएँ',
    enter: 'अपनी ट्रेन संख्या दर्ज करें।',
    notFound: 'इस कॉरिडोर की समय-सारणी में ट्रेन {no} नहीं है।',
    line: 'लाइन',
    entry: 'कॉरिडोर में प्रवेश',
    exit: 'कॉरिडोर से निकास',
    mps: 'सेक्शनल MPS',
    cautions: 'मार्ग पर सतर्कता आदेश',
    cautionsSub: '{n} जारी',
    blocksToday: 'आज मिलने वाले ब्लॉक',
    run: 'चलने के क्रम में यात्रा',
    runSub: 'हर ब्लॉक सेक्शन से समय-सारणी अनुसार गुज़रना',
    tsr: 'TSR {v} km/h',
    blockAt: 'ब्लॉक {window}',
    orders: 'चलने के क्रम में सतर्कता आदेश',
    ordersNone: 'आज आपके मार्ग पर कोई सतर्कता आदेश नहीं।',
    issued: 'जारी',
    draft: 'ड्राफ़्ट — कंट्रोल ने जारी नहीं किया',
    ack: 'पावती दें',
    acked: 'पावती दी',
    toastAck: 'सतर्कता आदेश {no} की पावती दी',
    blocks: 'आज आपके मार्ग पर ब्लॉक',
    blocksNone: 'आज आपके मार्ग पर कोई ब्लॉक नहीं।',
    held: '{mode}, लगभग {n} मिनट',
    noHold: 'विंडो के दौरान गुज़रती है; कोई रुकावट गणना नहीं',
    modeSLW: 'सिंगल-लाइन वर्किंग',
    modeHELD: 'रोकी जाएगी',
    modeREGULATED: 'रेगुलेटेड',
    granted: 'स्वीकृत',
    locked: 'लॉक',
    awaiting: 'कंट्रोल की स्वीकृति लंबित',
    inForce: '{n} दिन से लागू',
    note: 'यह जनरेट किए गए सतर्कता आदेश का दृश्य है, स्टेशन पर दिया गया हस्ताक्षरित T/409 नहीं।',
  },
} as const;

const isIssued = (o: CautionOrder) => o.status === 'ISSUED' || o.status === 'RECEIVED' || o.status === 'ACKNOWLEDGED';
const isGranted = (b: WorkingBlock) => b.status === 'GRANTED' || b.status === 'LOCKED';

/** Caution orders that apply to a train, in the order the train meets them. */
function ordersForTrain(orders: CautionOrder[], train: Train): CautionOrder[] {
  const pos = new Map(train.passages.map((p, i) => [p.sectionIndex, i]));
  const first = (o: CautionOrder) => Math.min(...o.sections.map((s) => pos.get(s) ?? Number.POSITIVE_INFINITY));
  return orders.filter((o) => o.status !== 'WITHDRAWN' && (o.line === 'BOTH' || o.line === train.line) && o.sections.some((s) => pos.has(s))).sort((a, b) => first(a) - first(b));
}

export default function FieldTrainPage() {
  const t = useT(strings);

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const tsrs = useAppStore((s) => s.tsrs);
  const forms = useAppStore((s) => s.forms);
  const acks = useAppStore((s) => s.acks);
  const ackCaution = useAppStore((s) => s.ackCaution);
  const notify = useAppStore((s) => s.notify);
  const lastTrainNo = useAppStore((s) => s.lastTrainNo);
  const setLastTrainNo = useAppStore((s) => s.setLastTrainNo);
  const toast = useAppStore((s) => s.toast);

  const [trainInput, setTrainInput] = useState(lastTrainNo ?? '');

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const train = useMemo(() => {
    const q = (lastTrainNo ?? '').trim().toLowerCase();
    if (!snapshot || !q) return null;
    return [...snapshot.feeds.timetable, ...snapshot.feeds.freight].find((tr) => tr.number.toLowerCase() === q) ?? null;
  }, [snapshot, lastTrainNo]);
  const orders = useMemo(() => (snapshot && train ? ordersForTrain(cautionOrders(snapshot, blocks, tsrs, forms, 0), train) : []), [snapshot, blocks, tsrs, forms, train]);
  const met = useMemo(() => (snapshot && train ? blocksMetByTrain(snapshot, blocks.filter((b) => b.day === 0), train).sort((a, b) => a.block.start - b.block.start) : []), [snapshot, blocks, train]);

  if (!snapshot) return <PlanPending />;

  const ackBy = user?.name ?? 'Loco pilot';
  const ackedByMe = (orderNo: string) => acks.some((a) => a.orderNo === orderNo && a.by === ackBy);
  const modeLabel = (m: AffectedTrain['mode']) => (m === 'SLW' ? t('modeSLW') : m === 'HELD' ? t('modeHELD') : t('modeREGULATED'));
  const statusLabel = (b: WorkingBlock) => (b.status === 'LOCKED' ? t('locked') : b.status === 'GRANTED' ? t('granted') : t('awaiting'));

  const commit = () => setLastTrainNo(trainInput.trim() || null);

  const onAck = (o: CautionOrder) => {
    ackCaution(o.orderNo);
    notify({ portals: ['control'], kind: 'OK', title: `Caution ${o.orderNo} acknowledged`, body: `${ackBy}${train ? ` · train ${train.number}` : ''}`, route: '/app/control/caution' });
    toast({ title: t('toastAck', { no: o.orderNo }), tone: 'ok' });
  };

  return (
    <div className="stack-lg">
      <PageHeader title={t('title')} lede={`${t('lede')} · ${snapshot.corridor.name}`} />

      <Card tour="my-train">
        <CardBody>
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <TrainIcon size={18} />
            <input
              className="input input-lg grow mono"
              style={{ minWidth: 0 }}
              list="field-train-list"
              autoComplete="off"
              placeholder={t('trainNo')}
              aria-label={t('trainNo')}
              value={trainInput}
              onChange={(e) => setTrainInput(e.target.value)}
              onBlur={commit}
            />
            <datalist id="field-train-list">
              {snapshot.feeds.timetable.map((tr) => (
                <option key={tr.id} value={tr.number}>{tr.name}</option>
              ))}
            </datalist>
            <button type="submit" className="btn btn-dark btn-lg">{t('show')}</button>
          </form>
          {train && (
            <div className="stack mt" style={{ gap: 2 }}>
              <div className="strong">
                <span className="num">{train.number}</span> {train.name}
              </div>
              <div className="small muted">
                {train.origin} → {train.destination} · {train.classLabel}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {!lastTrainNo ? (
        <EmptyState title={t('enter')} icon={<TrainIcon />} />
      ) : !train ? (
        <EmptyState title={t('notFound', { no: lastTrainNo })} icon={<TrainIcon />} />
      ) : (
        <>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <StatTile label={t('line')} value={train.line} />
            <StatTile label={t('entry')} value={hhmm(train.dep)} />
            <StatTile label={t('exit')} value={hhmm(train.arr)} />
            <StatTile label={t('mps')} value={snapshot.corridor.mpsKmph} unit="km/h" />
            <StatTile label={t('cautions')} value={orders.length} sub={t('cautionsSub', { n: orders.filter(isIssued).length })} />
            <StatTile label={t('blocksToday')} value={met.length} />
          </div>

          {/* run: every block section in running order */}
          <Card>
            <CardHead title={t('run')} sub={t('runSub')} right={<SimLabel kind="wttPositions" short />} />
            <CardBody tight>
              <ol className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 0 }}>
                {train.passages.map((p, i) => {
                  const sec = snapshot.corridor.blockSections[p.sectionIndex];
                  const here = orders.filter((o) => o.sections.includes(p.sectionIndex));
                  const blk = met.filter((m) => m.block.sections.includes(p.sectionIndex));
                  return (
                    <li key={p.sectionIndex} className="row-wrap" style={{ minHeight: 44, padding: '6px 0', borderBottom: i === train.passages.length - 1 ? 'none' : '1px solid var(--line)', gap: 8 }}>
                      <span className="mono num small" style={{ minWidth: 92 }}>{hhmm(p.enter)}–{hhmm(p.exit)}</span>
                      <span className="grow strong small">{sec?.label ?? p.sectionIndex}</span>
                      {here.map((o) => (
                        <Badge key={o.id} tone={isIssued(o) ? 'solid-crit' : 'crit'}>{t('tsr', { v: o.speedKmph })}</Badge>
                      ))}
                      {blk.map((m) => (
                        <Badge key={m.block.id} tone="warn">{t('blockAt', { window: `${m.block.startText}–${m.block.endText}` })}</Badge>
                      ))}
                    </li>
                  );
                })}
              </ol>
              <div className="row-wrap mt">
                <SimLabel kind="seededFeed" system="COA" seed={26027} />
              </div>
            </CardBody>
          </Card>

          {/* caution orders with acknowledgement */}
          <Card>
            <CardHead title={t('orders')} icon={<AlertTriangle />} />
            <CardBody tight>
              {orders.length === 0 ? (
                <div className="empty">{t('ordersNone')}</div>
              ) : (
                <div className="stack">
                  {orders.map((o) => {
                    const iss = isIssued(o);
                    const mine = ackedByMe(o.orderNo);
                    return (
                      <div key={o.id} className="well stack" style={{ gap: 6 }}>
                        <div className="row-wrap" style={{ gap: 6 }}>
                          <Badge tone="solid-crit">{o.speedKmph} km/h</Badge>
                          <span className="num strong small">{kmRange(o.startKm, o.endKm)}</span>
                          <span className="small">{o.line}</span>
                          <span className="grow" />
                          <Badge tone={iss ? 'ok' : 'gray'}>{iss ? t('issued') : t('draft')}</Badge>
                        </div>
                        <div className="small">{o.reason}</div>
                        <div className="tiny muted">
                          <span className="mono">{o.orderNo}</span> · {o.section} · {t('inForce', { n: o.daysInForce })}
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
                    );
                  })}
                </div>
              )}
              <p className="tiny muted mt">{t('note')}</p>
            </CardBody>
          </Card>

          {/* blocks met today with regulation */}
          <Card>
            <CardHead title={t('blocks')} right={<SimLabel kind="planningEstimate" short />} />
            <CardBody tight>
              {met.length === 0 ? (
                <div className="empty">{t('blocksNone')}</div>
              ) : (
                <div className="stack">
                  {met.map(({ block: b, impact }) => (
                    <div key={b.id} className="well stack" style={{ gap: 4 }}>
                      <div className="row-wrap" style={{ gap: 6 }}>
                        <span className="num strong">{b.startText}–{b.endText}</span>
                        <span className="small">{b.sectionText} · {b.line}</span>
                        <span className="grow" />
                        <Badge tone={isGranted(b) ? 'ok' : 'gray'}>{statusLabel(b)}</Badge>
                      </div>
                      <div className="small">{impact ? t('held', { mode: modeLabel(impact.mode), n: Math.round(impact.delayMin) }) : t('noHold')}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
