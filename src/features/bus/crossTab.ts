/**
 * Cross-tab sync. Every tab of the app on this device shares one persisted
 * store (localStorage key samanvay.v4). When another tab writes it, this tab
 * rehydrates so a grant in the Control tab shows up in the department tab
 * without a reload. The signed-in user of this tab is kept (two tabs can be
 * two different demo users). A BroadcastChannel nudges other tabs as soon as
 * a notification is pushed, in case storage events arrive late.
 *
 * Nothing leaves the device: this is same-browser sync only.
 */
import { buildRequest, deviceNotifyIfHidden, planRequestKey, useAppStore, type AppState } from '../../store/useAppStore';

const CHANNEL = 'samanvay.bus';
let started = false;

/** JSON with sorted keys, so two states with the same content compare equal whatever the key order. */
function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

function withoutUser(state: Record<string, unknown>): Record<string, unknown> {
  const { user: _user, ...rest } = state;
  return rest;
}

function persistedOf(st: AppState): Record<string, unknown> {
  const partialize = useAppStore.persist.getOptions().partialize;
  return (partialize ? partialize(st) : st) as Record<string, unknown>;
}

/** Start listening (idempotent). Returns a stop function. Call once from main.tsx. */
export function startCrossTabSync(): () => void {
  if (started || typeof window === 'undefined' || typeof localStorage === 'undefined') return () => {};
  started = true;
  const key = useAppStore.persist.getOptions().name ?? 'samanvay.v4';
  let timer: number | undefined;
  let busy = false;

  const sync = async () => {
    if (busy) {
      schedule();
      return;
    }
    let incoming: Record<string, unknown> | null = null;
    try {
      const raw = localStorage.getItem(key);
      incoming = raw ? ((JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? null) : null;
    } catch {
      return;
    }
    if (!incoming) return;
    const before = useAppStore.getState();
    // nothing but the other tab's user differs (or it is our own write): no rehydrate, so no write back
    if (stable(withoutUser(incoming)) === stable(withoutUser(persistedOf(before)))) return;
    busy = true;
    try {
      const me = before.user;
      const planBefore = planRequestKey(buildRequest(before));
      const seen = new Set(before.pushed.map((p) => p.id));
      await useAppStore.persist.rehydrate();
      const after = useAppStore.getState();
      // keep this tab's signed-in user; a signed-out tab adopts the other tab's session
      if (me && after.user?.id !== me.id) useAppStore.setState({ user: me });
      if (after.theme !== before.theme) document.documentElement.setAttribute('data-theme', after.theme);
      const now = useAppStore.getState();
      for (const p of now.pushed) if (!seen.has(p.id)) deviceNotifyIfHidden(p, now);
      // the other tab changed what the optimiser plans with (intake, pins, approvals held fixed, corridor …)
      if (planRequestKey(buildRequest(now)) !== planBefore || now.corridorId !== before.corridorId) void now.runPlan({ reason: 'changes from another tab', silent: true });
    } finally {
      busy = false;
    }
  };

  const schedule = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      void sync();
    }, 120);
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) schedule();
  };
  window.addEventListener('storage', onStorage);

  let channel: BroadcastChannel | null = null;
  try {
    channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  } catch {
    channel = null;
  }
  const onMessage = (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type === 'state') schedule();
  };
  channel?.addEventListener('message', onMessage);
  // our own new notifications: wake the other tabs immediately (the write has happened by the time they read)
  const unsubscribe = useAppStore.subscribe((s, prev) => {
    if (channel && s.pushed !== prev.pushed && s.pushed.length && s.pushed[0]?.id !== prev.pushed[0]?.id) channel.postMessage({ type: 'state', id: s.pushed[0].id });
  });

  return () => {
    window.removeEventListener('storage', onStorage);
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    unsubscribe();
    if (timer !== undefined) window.clearTimeout(timer);
    started = false;
  };
}
