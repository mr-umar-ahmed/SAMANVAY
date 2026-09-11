/**
 * AdminPage — /app/division/admin (spec §3.24, `admin` capability).
 * Browser-local accounts (src/auth/users.ts), engine run controls, UI
 * defaults, and the data kept on this device (persisted store, IndexedDB
 * photos). Users / defaults / storage work without a plan; plan facts show
 * "—" until the engine has run.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw, RotateCcw, Trash2, Upload, UserPlus } from 'lucide-react';
import { keys as idbKeys, getMany as idbGetMany, delMany as idbDelMany } from 'idb-keyval';
import { useAppStore, type Theme } from '../../store/useAppStore';
import { CORRIDORS } from '../../engine/corridors.js';
import type { Corridor } from '../../engine/types';
import { DEMO_ACCOUNTS, PORTALS, ROLES, can, type RoleId } from '../../auth/portals';
import { listRegistered, removeRegistered, signup } from '../../auth/users';
import { useT, type Lang } from '../../i18n';
import { common } from '../../i18n/common';
import { dateLabel, download, num, timeAgo } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardFoot, CardHead, DataTable, DeptBadge, Field, KeyValue, Modal, PageHeader, Segmented, StatTile, Tabs, type Column } from '../../components/ui';
import { SimLabel, Slider } from '../../components/ui/extras';

/** The worker is never sent a seed by the store, so the engine default applies (engine/worker.ts). */
const ENGINE_SEED = 26027;
const STORE_KEY = 'samanvay.v4';
const CORRIDOR_LIST = CORRIDORS as Corridor[];

type TabId = 'users' | 'data' | 'defaults' | 'storage';

/** Stat tile row: kit .grid with a one-off column template. */
const TILES = { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' } as const;

const strings = {
  en: {
    title: 'Administration',
    lede: 'Accounts on this device, engine runs, defaults and the data this browser keeps.',
    noAdmin: 'This page needs the admin capability. You can read it; changes are disabled.',
    tabUsers: 'Users',
    tabData: 'Data',
    tabDefaults: 'Defaults',
    tabStorage: 'Storage',
    sDemo: 'Demo accounts',
    sDemoSub: 'Password: samanvay',
    sLocal: 'Accounts on this device',
    sLocalSub: 'Created here, SHA-256 password digest',
    sSeed: 'Engine seed',
    sSeedSub: 'Feeds are generated from it',
    sRun: 'Last plan run',
    sRunPending: 'Computing',
    usersTitle: 'Users and roles',
    usersSub: 'Demo accounts are built in; accounts created here live in this browser only.',
    addUser: 'Add user',
    colName: 'Name',
    colRole: 'Role',
    colPortal: 'Portal',
    colPlace: 'Designation · division',
    colCreated: 'Created',
    colActions: '',
    demo: 'Demo',
    local: 'This device',
    remove: 'Remove',
    onlyDemo: 'Only demo accounts exist on this device.',
    addTitle: 'Add a browser-local account',
    fName: 'Full name',
    fEmail: 'Email',
    fPassword: 'Password',
    fPasswordHint: 'At least 4 characters. Stored as a SHA-256 digest in this browser.',
    fRole: 'Role',
    fDesignation: 'Designation',
    fDivision: 'Division',
    create: 'Create account',
    errExists: 'An account with this email already exists.',
    errInvalid: 'Name, email and a password of at least 4 characters are needed.',
    userAdded: 'Account created',
    userAddedBody: '{name} can now sign in to the {portal} portal',
    removeTitle: 'Remove account',
    removeBody: 'Remove {name} ({email}) from this browser? The person will no longer be able to sign in here.',
    userRemoved: 'Account removed',
    engineTitle: 'Engine',
    engineSub: 'The seed fixes the generated COA, FOIS, TMS, SMMS and TDMS feeds so every screen shows the same data.',
    seed: 'Seed',
    seedHint: 'Fixed in this build.',
    reseed: 'Reseed',
    reseedHint: 'Regenerates the feeds from the seed and re-runs every horizon.',
    reseeded: 'Feeds regenerated (seed {seed})',
    running: 'The engine is running',
    lastRun: 'Last run',
    runNo: 'Run number',
    runTime: 'Run time',
    iterationsUsed: 'Iterations in the last run',
    works: 'Works in the register',
    iterTitle: 'Search effort',
    iterLabel: 'Annealing iterations',
    iterHint: 'More iterations search longer for a better plan. Range 500 – 20,000.',
    iterApply: 'Apply and re-plan',
    iterDone: 'Iterations set to {n} — plan re-run',
    corridorTitle: 'Corridor',
    corridorSub: 'Switching clears the workflow records keyed to the current blocks (approvals, execution, forms) and re-plans.',
    corridorSwitch: 'Switch corridor',
    corridorConfirm: 'Switch to {name}? Approvals, execution records, forms and power-block records of the current corridor are cleared.',
    corridorDone: 'Corridor switched to {name}',
    resetTitle: 'Demo data',
    resetSub: 'Clears approvals, execution, reports, requisitions, TSRs, forms, directions, escalations, notifications and the audit trail, then re-plans.',
    resetBtn: 'Reset demo data',
    resetConfirm: 'Everything recorded on this device for the demo is cleared. Accounts and settings stay.',
    resetDone: 'Demo data reset — plan re-run',
    langTitle: 'Language',
    themeTitle: 'Theme',
    themeLight: 'Light',
    themeDark: 'Night',
    themeSun: 'Sunlight',
    audioTitle: 'Audio cues',
    audioLabel: 'Play a chime on Control notifications',
    audioOn: 'Audio cues on',
    audioOff: 'Audio cues off',
    langSet: 'Language set',
    themeSet: 'Theme set',
    roiTitle: 'ROI assumptions',
    roiSub: 'Unit values used for rupee figures on the division pages.',
    roiOpen: 'Open ROI audit',
    toursTitle: 'Tours',
    toursSub: 'Show the first-run tour again in every portal.',
    toursReset: 'Reset all tours',
    toursDone: 'Tours reset — each portal will show its tour again',
    storageTitle: 'On this device',
    storageSub: 'Nothing here is transmitted. Clearing browser data removes it.',
    photos: 'Report photos (IndexedDB)',
    photosValue: '{n} photos · {mb} MB',
    stateSize: 'App state (localStorage)',
    quota: 'Browser storage used',
    quotaNA: 'Not reported by this browser',
    clearPhotos: 'Clear photos',
    clearPhotosConfirm: 'Delete {n} photos stored on this device? Reports keep their text but lose the photo.',
    photosCleared: '{n} photos deleted',
    exportState: 'Export state JSON',
    exported: 'State exported',
    importState: 'Import state',
    importConfirm: 'Replace the workflow state on this device with the file {file}? The current state is overwritten.',
    importDone: 'State imported — plan re-run',
    importBad: 'That file is not a SAMANVAY state export.',
    confirm: 'Confirm',
  },
  hi: {
    title: 'प्रशासन',
    lede: 'इस डिवाइस के खाते, इंजन run, डिफ़ॉल्ट और यह ब्राउज़र जो डेटा रखता है।',
    noAdmin: 'इस पृष्ठ के लिए admin क्षमता चाहिए। आप पढ़ सकते हैं; परिवर्तन बंद हैं।',
    tabUsers: 'उपयोगकर्ता',
    tabData: 'डेटा',
    tabDefaults: 'डिफ़ॉल्ट',
    tabStorage: 'भंडारण',
    sDemo: 'डेमो खाते',
    sDemoSub: 'पासवर्ड: samanvay',
    sLocal: 'इस डिवाइस के खाते',
    sLocalSub: 'यहाँ बनाए गए, SHA-256 पासवर्ड डाइजेस्ट',
    sSeed: 'इंजन seed',
    sSeedSub: 'फ़ीड इसी से बनती हैं',
    sRun: 'अंतिम योजना run',
    sRunPending: 'गणना चल रही है',
    usersTitle: 'उपयोगकर्ता और भूमिकाएँ',
    usersSub: 'डेमो खाते अंतर्निहित हैं; यहाँ बने खाते केवल इसी ब्राउज़र में रहते हैं।',
    addUser: 'उपयोगकर्ता जोड़ें',
    colName: 'नाम',
    colRole: 'भूमिका',
    colPortal: 'पोर्टल',
    colPlace: 'पदनाम · मंडल',
    colCreated: 'बनाया गया',
    colActions: '',
    demo: 'डेमो',
    local: 'यह डिवाइस',
    remove: 'हटाएँ',
    onlyDemo: 'इस डिवाइस पर केवल डेमो खाते हैं।',
    addTitle: 'ब्राउज़र-स्थानीय खाता जोड़ें',
    fName: 'पूरा नाम',
    fEmail: 'ईमेल',
    fPassword: 'पासवर्ड',
    fPasswordHint: 'कम से कम 4 अक्षर। इस ब्राउज़र में SHA-256 डाइजेस्ट के रूप में।',
    fRole: 'भूमिका',
    fDesignation: 'पदनाम',
    fDivision: 'मंडल',
    create: 'खाता बनाएँ',
    errExists: 'इस ईमेल से खाता पहले से मौजूद है।',
    errInvalid: 'नाम, ईमेल और कम से कम 4 अक्षर का पासवर्ड चाहिए।',
    userAdded: 'खाता बनाया गया',
    userAddedBody: '{name} अब {portal} पोर्टल में साइन इन कर सकते हैं',
    removeTitle: 'खाता हटाएँ',
    removeBody: '{name} ({email}) को इस ब्राउज़र से हटाएँ? वे यहाँ साइन इन नहीं कर पाएँगे।',
    userRemoved: 'खाता हटाया गया',
    engineTitle: 'इंजन',
    engineSub: 'Seed उत्पन्न COA, FOIS, TMS, SMMS और TDMS फ़ीड तय करता है ताकि हर स्क्रीन पर एक ही डेटा दिखे।',
    seed: 'Seed',
    seedHint: 'इस बिल्ड में स्थिर।',
    reseed: 'Reseed',
    reseedHint: 'Seed से फ़ीड दोबारा बनाता है और हर अवधि दोबारा चलाता है।',
    reseeded: 'फ़ीड दोबारा बनीं (seed {seed})',
    running: 'इंजन चल रहा है',
    lastRun: 'अंतिम run',
    runNo: 'Run क्रमांक',
    runTime: 'Run समय',
    iterationsUsed: 'अंतिम run में iterations',
    works: 'रजिस्टर में कार्य',
    iterTitle: 'खोज प्रयास',
    iterLabel: 'Annealing iterations',
    iterHint: 'अधिक iterations बेहतर योजना के लिए अधिक खोजते हैं। सीमा 500 – 20,000।',
    iterApply: 'लागू करें और पुनः योजना',
    iterDone: 'Iterations {n} किए — योजना दोबारा चली',
    corridorTitle: 'कॉरिडोर',
    corridorSub: 'बदलने पर वर्तमान ब्लॉकों से जुड़े रिकॉर्ड (अनुमोदन, निष्पादन, प्रपत्र) साफ़ होते हैं और पुनः योजना बनती है।',
    corridorSwitch: 'कॉरिडोर बदलें',
    corridorConfirm: '{name} पर जाएँ? वर्तमान कॉरिडोर के अनुमोदन, निष्पादन रिकॉर्ड, प्रपत्र और पावर-ब्लॉक रिकॉर्ड साफ़ होंगे।',
    corridorDone: 'कॉरिडोर {name} पर बदला',
    resetTitle: 'डेमो डेटा',
    resetSub: 'अनुमोदन, निष्पादन, रिपोर्ट, requisition, TSR, प्रपत्र, निर्देश, एस्केलेशन, सूचनाएँ और ऑडिट ट्रेल साफ़ कर पुनः योजना बनाता है।',
    resetBtn: 'डेमो डेटा रीसेट करें',
    resetConfirm: 'इस डिवाइस पर डेमो के लिए दर्ज सब कुछ साफ़ होगा। खाते और सेटिंग्स बनी रहेंगी।',
    resetDone: 'डेमो डेटा रीसेट — योजना दोबारा चली',
    langTitle: 'भाषा',
    themeTitle: 'थीम',
    themeLight: 'हल्की',
    themeDark: 'रात्रि',
    themeSun: 'धूप',
    audioTitle: 'ध्वनि संकेत',
    audioLabel: 'Control सूचनाओं पर ध्वनि बजाएँ',
    audioOn: 'ध्वनि संकेत चालू',
    audioOff: 'ध्वनि संकेत बंद',
    langSet: 'भाषा सेट',
    themeSet: 'थीम सेट',
    roiTitle: 'ROI मान्यताएँ',
    roiSub: 'मंडल पृष्ठों पर रुपये के आँकड़ों के इकाई मान।',
    roiOpen: 'ROI ऑडिट खोलें',
    toursTitle: 'टूर',
    toursSub: 'हर पोर्टल में पहला टूर फिर दिखाएँ।',
    toursReset: 'सभी टूर रीसेट करें',
    toursDone: 'टूर रीसेट — हर पोर्टल फिर टूर दिखाएगा',
    storageTitle: 'इस डिवाइस पर',
    storageSub: 'यहाँ से कुछ भी भेजा नहीं जाता। ब्राउज़र डेटा साफ़ करने पर यह हट जाता है।',
    photos: 'रिपोर्ट फ़ोटो (IndexedDB)',
    photosValue: '{n} फ़ोटो · {mb} MB',
    stateSize: 'ऐप स्थिति (localStorage)',
    quota: 'ब्राउज़र भंडारण उपयोग',
    quotaNA: 'यह ब्राउज़र नहीं बताता',
    clearPhotos: 'फ़ोटो साफ़ करें',
    clearPhotosConfirm: 'इस डिवाइस की {n} फ़ोटो हटाएँ? रिपोर्टों का पाठ रहेगा, फ़ोटो नहीं।',
    photosCleared: '{n} फ़ोटो हटाई गईं',
    exportState: 'स्थिति JSON निर्यात',
    exported: 'स्थिति निर्यात',
    importState: 'स्थिति आयात',
    importConfirm: 'इस डिवाइस की कार्यप्रवाह स्थिति को फ़ाइल {file} से बदलें? वर्तमान स्थिति मिट जाएगी।',
    importDone: 'स्थिति आयात — योजना दोबारा चली',
    importBad: 'यह फ़ाइल SAMANVAY स्थिति निर्यात नहीं है।',
    confirm: 'पुष्टि करें',
  },
} as const;

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  designation: string;
  division: string;
  createdAt: string | null;
  local: boolean;
}

type Confirm =
  | { kind: 'remove'; user: UserRow }
  | { kind: 'corridor'; id: string }
  | { kind: 'reset' }
  | { kind: 'photos'; n: number }
  | { kind: 'import'; file: string; payload: { state: Record<string, unknown>; version?: number } };

interface StorageInfo {
  photoKeys: string[];
  photoBytes: number;
  stateBytes: number;
  usage: number | null;
  quota: number | null;
}

const mb = (bytes: number) => (bytes / 1048576).toFixed(2);

export default function AdminPage() {
  const t = useT(strings);
  const tc = useT(common);
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const user = useAppStore((s) => s.user);
  const snapshot = useAppStore((s) => s.snapshot);
  const planStatus = useAppStore((s) => s.planStatus);
  const planVersion = useAppStore((s) => s.planVersion);
  const lastPlannedAt = useAppStore((s) => s.lastPlannedAt);
  const corridorId = useAppStore((s) => s.corridorId);
  const iterations = useAppStore((s) => s.iterations);
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const audioMuted = useAppStore((s) => s.audioMuted);
  const setIterations = useAppStore((s) => s.setIterations);
  const setCorridor = useAppStore((s) => s.setCorridor);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setTheme = useAppStore((s) => s.setTheme);
  const setAudioMuted = useAppStore((s) => s.setAudioMuted);
  const resetDemoData = useAppStore((s) => s.resetDemoData);
  const resetTours = useAppStore((s) => s.resetTours);
  const runPlan = useAppStore((s) => s.runPlan);
  const addAudit = useAppStore((s) => s.addAudit);
  const toast = useAppStore((s) => s.toast);

  const [tab, setTab] = useState<TabId>('users');
  const [usersVersion, setUsersVersion] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'SSE_PWAY' as RoleId, designation: '', division: 'Agra' });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [iterDraft, setIterDraft] = useState<number | null>(null);
  /** null = follow the current corridor (it can also be switched from the top bar) */
  const [corridorPick, setCorridorPick] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [storageVersion, setStorageVersion] = useState(0);

  const canAdmin = can(user, 'admin');
  const running = planStatus === 'running';
  const corridorDraft = corridorPick ?? corridorId;

  const users: UserRow[] = useMemo(() => {
    void usersVersion;
    const demo: UserRow[] = DEMO_ACCOUNTS.map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role, designation: a.designation, division: a.division, createdAt: null, local: false }));
    const local: UserRow[] = listRegistered().map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, designation: u.designation, division: u.division, createdAt: u.createdAt, local: true }));
    return [...demo, ...local];
  }, [usersVersion]);
  const localCount = users.filter((u) => u.local).length;

  // Storage facts are read from the browser when the Storage tab is opened (and after changes).
  useEffect(() => {
    if (tab !== 'storage') return;
    let cancelled = false;
    (async () => {
      const all = (await idbKeys()).map(String);
      const photoKeys = all.filter((k) => k.startsWith('photo:'));
      const blobs = await idbGetMany<Blob | undefined>(photoKeys);
      const photoBytes = blobs.reduce((s, b) => s + (b?.size ?? 0), 0);
      let stateBytes = 0;
      try {
        stateBytes = (localStorage.getItem(STORE_KEY) ?? '').length * 2;
      } catch {
        stateBytes = 0;
      }
      let usage: number | null = null;
      let quota: number | null = null;
      try {
        const est = await navigator.storage?.estimate?.();
        usage = est?.usage ?? null;
        quota = est?.quota ?? null;
      } catch {
        usage = null;
      }
      if (!cancelled) setStorage({ photoKeys, photoBytes, stateBytes, usage, quota });
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, storageVersion]);

  const corridorName = (id: string) => CORRIDOR_LIST.find((c) => c.id === id)?.name ?? id;

  /* ── actions ─────────────────────────────────────────────── */
  const createUser = async () => {
    setBusy(true);
    setFormError(null);
    const res = await signup({ name: form.name, email: form.email, password: form.password, role: form.role, designation: form.designation || undefined, division: form.division || undefined });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.error === 'exists' ? t('errExists') : t('errInvalid'));
      return;
    }
    addAudit({ action: 'USER_CREATED', entityType: 'user', entityId: res.user.id, detail: `${res.user.name} · ${res.user.email} · ${res.user.role}` });
    toast({ title: t('userAdded'), body: t('userAddedBody', { name: res.user.name, portal: PORTALS[res.user.portal].label[language === 'hi' ? 'hi' : 'en'] }), tone: 'ok' });
    setUsersVersion((v) => v + 1);
    setAddOpen(false);
    setForm({ name: '', email: '', password: '', role: 'SSE_PWAY', designation: '', division: 'Agra' });
  };

  const doConfirm = async () => {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    if (c.kind === 'remove') {
      removeRegistered(c.user.id);
      addAudit({ action: 'USER_REMOVED', entityType: 'user', entityId: c.user.id, detail: `${c.user.name} · ${c.user.email}` });
      toast({ title: t('userRemoved'), body: c.user.email, tone: 'info' });
      setUsersVersion((v) => v + 1);
    } else if (c.kind === 'corridor') {
      setCorridor(c.id);
      setCorridorPick(null);
      toast({ title: t('corridorDone', { name: corridorName(c.id) }), tone: 'ok' });
    } else if (c.kind === 'reset') {
      resetDemoData();
      toast({ title: t('resetDone'), tone: 'ok' });
    } else if (c.kind === 'photos') {
      const keys = storage?.photoKeys ?? [];
      await idbDelMany(keys);
      addAudit({ action: 'PHOTOS_CLEARED', entityType: 'settings', entityId: 'photos', detail: `${keys.length} photos deleted from this device` });
      toast({ title: t('photosCleared', { n: keys.length }), tone: 'info' });
      setStorageVersion((v) => v + 1);
    } else if (c.kind === 'import') {
      localStorage.setItem(STORE_KEY, JSON.stringify(c.payload));
      await useAppStore.persist.rehydrate();
      useAppStore.getState().addAudit({ action: 'STATE_IMPORTED', entityType: 'settings', entityId: 'state', detail: c.file });
      useAppStore.getState().toast({ title: t('importDone'), tone: 'ok' });
      void useAppStore.getState().runPlan({ reason: 'state imported' });
      setStorageVersion((v) => v + 1);
    }
  };

  const onReseed = () => {
    void runPlan({ reason: 'reseed' });
    toast({ title: t('reseeded', { seed: ENGINE_SEED }), tone: 'ok' });
  };

  const onApplyIterations = () => {
    if (iterDraft === null) return;
    setIterations(iterDraft);
    addAudit({ action: 'ITERATIONS_CHANGED', entityType: 'settings', entityId: 'iterations', detail: `${iterations} → ${iterDraft}` });
    void runPlan({ reason: `iterations ${iterDraft}` });
    toast({ title: t('iterDone', { n: num(iterDraft) }), tone: 'ok' });
    setIterDraft(null);
  };

  const onExportState = () => {
    let store: unknown = null;
    try {
      store = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    } catch {
      store = null;
    }
    const payload = { app: 'SAMANVAY', exportedAt: new Date().toISOString(), store, users: listRegistered() };
    download(`samanvay-state-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    addAudit({ action: 'STATE_EXPORTED', entityType: 'settings', entityId: 'state' });
    toast({ title: t('exported'), tone: 'ok' });
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { app?: string; store?: { state?: unknown; version?: number } };
      const store = parsed.store;
      if (parsed.app !== 'SAMANVAY' || !store || typeof store.state !== 'object' || store.state === null) throw new Error('bad');
      setConfirm({ kind: 'import', file: file.name, payload: { state: store.state as Record<string, unknown>, version: store.version } });
    } catch {
      toast({ title: t('importBad'), tone: 'crit' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmText = (c: Confirm): string => {
    switch (c.kind) {
      case 'remove':
        return t('removeBody', { name: c.user.name, email: c.user.email });
      case 'corridor':
        return t('corridorConfirm', { name: corridorName(c.id) });
      case 'reset':
        return t('resetConfirm');
      case 'photos':
        return t('clearPhotosConfirm', { n: c.n });
      case 'import':
        return t('importConfirm', { file: c.file });
    }
  };
  const confirmTitle = (c: Confirm): string => (c.kind === 'remove' ? t('removeTitle') : c.kind === 'corridor' ? t('corridorSwitch') : c.kind === 'reset' ? t('resetBtn') : c.kind === 'photos' ? t('clearPhotos') : t('importState'));

  const roleLabel = (r: RoleId) => ROLES[r].label[language === 'hi' ? 'hi' : 'en'];

  const userColumns: Column<UserRow>[] = [
    {
      key: 'name',
      header: t('colName'),
      render: (u) => (
        <span className="stack" style={{ gap: 1 }}>
          <span className="small strong">{u.name}</span>
          <span className="tiny muted mono">{u.email}</span>
        </span>
      ),
    },
    { key: 'role', header: t('colRole'), render: (u) => <span className="small">{roleLabel(u.role)}</span> },
    {
      key: 'portal',
      header: t('colPortal'),
      render: (u) => {
        const role = ROLES[u.role];
        return (
          <span className="row-wrap" style={{ gap: 4 }}>
            <Badge tone={PORTALS[role.portal].pastel}>{PORTALS[role.portal].short[language === 'hi' ? 'hi' : 'en']}</Badge>
            {role.dept && <DeptBadge dept={role.dept} />}
          </span>
        );
      },
    },
    { key: 'place', header: t('colPlace'), hideMobile: true, render: (u) => <span className="small muted">{u.designation} · {u.division}</span> },
    {
      key: 'created',
      header: t('colCreated'),
      hideMobile: true,
      render: (u) => (u.local && u.createdAt ? <span className="small">{dateLabel(u.createdAt.slice(0, 10))}</span> : <Badge tone="gray">{t('demo')}</Badge>),
    },
    {
      key: 'actions',
      header: t('colActions'),
      render: (u) =>
        u.local ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm({ kind: 'remove', user: u })} disabled={!canAdmin}>
            <Trash2 /> {t('remove')}
          </button>
        ) : null,
    },
  ];

  return (
    <div className="stack-lg">
      <PageHeader title={t('title')} lede={t('lede')} badges={<SimLabel kind="localAuth" />} />

      {!canAdmin && <Callout tone="warn">{t('noAdmin')}</Callout>}

      <div className="grid" style={TILES}>
        <StatTile label={t('sDemo')} value={DEMO_ACCOUNTS.length} sub={t('sDemoSub')} />
        <StatTile label={t('sLocal')} value={localCount} sub={t('sLocalSub')} pastel="blue" />
        <StatTile label={t('sSeed')} value={<span className="mono">{ENGINE_SEED}</span>} sub={t('sSeedSub')} />
        <StatTile label={t('sRun')} value={snapshot ? `#${planVersion}` : '—'} sub={snapshot && lastPlannedAt ? timeAgo(lastPlannedAt) : t('sRunPending')} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'users', label: t('tabUsers'), count: users.length },
          { id: 'data', label: t('tabData') },
          { id: 'defaults', label: t('tabDefaults') },
          { id: 'storage', label: t('tabStorage') },
        ]}
      />

      {tab === 'users' && (
        <Card tour="admin-users">
          <CardHead
            title={t('usersTitle')}
            sub={t('usersSub')}
            right={
              <>
                <SimLabel kind="localAuth" />
                <button type="button" className="btn btn-sm btn-primary" onClick={() => { setFormError(null); setAddOpen(true); }} disabled={!canAdmin}>
                  <UserPlus /> {t('addUser')}
                </button>
              </>
            }
          />
          <CardBody flush>
            <DataTable columns={userColumns} rows={users} rowKey={(u) => u.id} compact />
          </CardBody>
          {localCount === 0 && (
            <CardFoot>
              <span className="small muted">{t('onlyDemo')}</span>
            </CardFoot>
          )}
        </Card>
      )}

      {tab === 'data' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title={t('engineTitle')} sub={t('engineSub')} />
            <CardBody>
              <div className="stack">
                <Field label={t('seed')} hint={t('seedHint')} htmlFor="adm-seed">
                  <input id="adm-seed" className="input mono" value={ENGINE_SEED} readOnly />
                </Field>
                <KeyValue
                  items={[
                    [t('lastRun'), snapshot && lastPlannedAt ? timeAgo(lastPlannedAt) : '—'],
                    [t('runNo'), snapshot ? <span key="run" className="num">{planVersion}</span> : '—'],
                    [t('runTime'), snapshot ? <span key="ms" className="num">{(snapshot.timing.ms / 1000).toFixed(1)} s</span> : '—'],
                    [t('iterationsUsed'), snapshot ? <span key="it" className="num">{num(snapshot.result.weekly.ai.search.iterations)}</span> : '—'],
                    [t('works'), snapshot ? <span key="works" className="num">{num(snapshot.counts.total)}</span> : '—'],
                  ]}
                />
                <div className="row-wrap">
                  <button type="button" className="btn" onClick={onReseed} disabled={!canAdmin || running} title={running ? t('running') : t('reseedHint')}>
                    <RefreshCw className={running ? 'spin' : ''} /> {t('reseed')}
                  </button>
                  <span className="tiny muted">{t('reseedHint')}</span>
                </div>
                <SimLabel kind="seededFeed" seed={ENGINE_SEED} />
              </div>
            </CardBody>
          </Card>

          <div className="stack-lg">
            <Card>
              <CardHead title={t('iterTitle')} right={<SimLabel kind="solver" short />} />
              <CardBody>
                <Slider label={t('iterLabel')} value={iterDraft ?? iterations} min={500} max={20000} step={500} onChange={setIterDraft} format={(v) => num(v)} hint={t('iterHint')} />
                <button type="button" className="btn btn-sm" onClick={onApplyIterations} disabled={!canAdmin || running || iterDraft === null || iterDraft === iterations}>
                  {t('iterApply')}
                </button>
              </CardBody>
            </Card>

            <Card>
              <CardHead title={t('corridorTitle')} sub={t('corridorSub')} />
              <CardBody>
                <div className="row-wrap" style={{ alignItems: 'flex-end' }}>
                  <Field label={tc('corridor')} htmlFor="adm-corridor">
                    <select id="adm-corridor" className="select" value={corridorDraft} onChange={(e) => setCorridorPick(e.target.value)}>
                      {CORRIDOR_LIST.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code}) · {c.division}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="button" className="btn btn-sm" onClick={() => setConfirm({ kind: 'corridor', id: corridorDraft })} disabled={!canAdmin || corridorDraft === corridorId}>
                    {t('corridorSwitch')}
                  </button>
                </div>
              </CardBody>
            </Card>

            <Card pastel="pink">
              <CardHead title={t('resetTitle')} sub={t('resetSub')} />
              <CardBody>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm({ kind: 'reset' })} disabled={!canAdmin}>
                  <RotateCcw /> {t('resetBtn')}
                </button>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === 'defaults' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title={t('langTitle')} />
            <CardBody>
              <Segmented<Lang>
                ariaLabel={t('langTitle')}
                value={language === 'hi' ? 'hi' : 'en'}
                onChange={(l) => {
                  setLanguage(l);
                  toast({ title: t('langSet'), body: l === 'hi' ? 'हिन्दी' : 'English', tone: 'ok' });
                }}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'hi', label: 'हिन्दी' },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('themeTitle')} />
            <CardBody>
              <Segmented<Theme>
                ariaLabel={t('themeTitle')}
                value={theme}
                onChange={(v) => {
                  setTheme(v);
                  toast({ title: t('themeSet'), body: v === 'light' ? t('themeLight') : v === 'dark' ? t('themeDark') : t('themeSun'), tone: 'ok' });
                }}
                options={[
                  { value: 'light', label: t('themeLight') },
                  { value: 'dark', label: t('themeDark') },
                  { value: 'sunlight', label: t('themeSun') },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('audioTitle')} />
            <CardBody>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!audioMuted}
                  onChange={(e) => {
                    setAudioMuted(!e.target.checked);
                    toast({ title: e.target.checked ? t('audioOn') : t('audioOff'), tone: 'info' });
                  }}
                />
                {t('audioLabel')}
              </label>
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('roiTitle')} sub={t('roiSub')} />
            <CardBody>
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/division/roi')}>
                {t('roiOpen')}
              </button>
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('toursTitle')} sub={t('toursSub')} />
            <CardBody>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  resetTours();
                  toast({ title: t('toursDone'), tone: 'ok' });
                }}
              >
                <RotateCcw /> {t('toursReset')}
              </button>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'storage' && (
        <Card>
          <CardHead title={t('storageTitle')} sub={t('storageSub')} right={<SimLabel kind="localOnly" />} />
          <CardBody>
            <div className="stack-lg">
              <KeyValue
                items={[
                  [t('photos'), storage ? t('photosValue', { n: storage.photoKeys.length, mb: mb(storage.photoBytes) }) : '…'],
                  [t('stateSize'), storage ? `${mb(storage.stateBytes)} MB` : '…'],
                  [t('quota'), storage && storage.usage !== null ? `${mb(storage.usage)} MB${storage.quota ? ` / ${mb(storage.quota)} MB` : ''}` : storage ? t('quotaNA') : '…'],
                ]}
              />
              <div className="row-wrap">
                <button type="button" className="btn btn-sm" onClick={onExportState}>
                  <Download /> {t('exportState')}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={!canAdmin}>
                  <Upload /> {t('importState')}
                </button>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />
                <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirm({ kind: 'photos', n: storage?.photoKeys.length ?? 0 })} disabled={!canAdmin || !storage || storage.photoKeys.length === 0}>
                  <Trash2 /> {t('clearPhotos')}
                </button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('addTitle')}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAddOpen(false)}>
              {tc('cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void createUser()} disabled={busy || !form.name.trim() || !form.email.trim() || form.password.length < 4}>
              <UserPlus /> {t('create')}
            </button>
          </>
        }
      >
        <div className="stack">
          <SimLabel kind="localAuth" />
          <div className="form-grid">
            <Field label={t('fName')} htmlFor="adm-name">
              <input id="adm-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
            </Field>
            <Field label={t('fEmail')} htmlFor="adm-email">
              <input id="adm-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
            </Field>
            <Field label={t('fPassword')} hint={t('fPasswordHint')} htmlFor="adm-pw">
              <input id="adm-pw" className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label={t('fRole')} htmlFor="adm-role">
              <select id="adm-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleId })}>
                {(Object.keys(ROLES) as RoleId[]).map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)} · {PORTALS[ROLES[r].portal].short[language === 'hi' ? 'hi' : 'en']}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('fDesignation')} htmlFor="adm-desig">
              <input id="adm-desig" className="input" value={form.designation} placeholder={roleLabel(form.role)} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </Field>
            <Field label={t('fDivision')} htmlFor="adm-div">
              <input id="adm-div" className="input" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} />
            </Field>
          </div>
          {formError && <Callout tone="crit">{formError}</Callout>}
        </div>
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? confirmTitle(confirm) : ''}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirm(null)}>
              {tc('cancel')}
            </button>
            <button type="button" className={`btn ${confirm?.kind === 'corridor' ? 'btn-primary' : 'btn-danger'}`} onClick={() => void doConfirm()}>
              {t('confirm')}
            </button>
          </>
        }
      >
        {confirm && <Callout tone={confirm.kind === 'corridor' ? 'warn' : 'crit'}>{confirmText(confirm)}</Callout>}
      </Modal>
    </div>
  );
}

