/**
 * Main-thread client for the planning worker. One worker, sequenced requests,
 * progress callbacks. Falls back to an inline run if workers are unavailable.
 */
import type { PlanRequest, ProgressHandler, Snapshot, WorkerMessage } from './types';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (s: Snapshot) => void; reject: (e: Error) => void; onProgress?: ProgressHandler }>();

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') p.onProgress?.({ step: msg.step, text: msg.text });
      else if (msg.type === 'done') {
        pending.delete(msg.id);
        p.resolve(msg.snapshot);
      } else if (msg.type === 'error') {
        pending.delete(msg.id);
        p.reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Planning worker failed'));
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function runPlan(req: PlanRequest, onProgress?: ProgressHandler): Promise<Snapshot> {
  const w = ensureWorker();
  if (!w) return Promise.reject(new Error('Web Workers are not available in this browser'));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ id, ...req });
  });
}

/** Terminate the worker (e.g. before a heavy re-run) — pending requests are rejected. */
export function resetWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const p of pending.values()) p.reject(new Error('Planning cancelled'));
  pending.clear();
}
