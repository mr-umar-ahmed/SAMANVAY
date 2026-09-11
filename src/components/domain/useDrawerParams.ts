/**
 * Drawer state lives in the URL so that links work across portals
 * (CONTRACT §8): ?block=<id> ?task=<id> ?report=<id> ?req=<id> open the
 * matching drawer; ?train=<no> ?station=<code> ?day=<0-6> ?week=<n> select
 * context. Every update replaces the history entry and keeps the other
 * params untouched.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export type DrawerKind = 'block' | 'task' | 'report' | 'req';
export type ContextKey = 'train' | 'station' | 'day' | 'week';

export const DRAWER_KINDS: DrawerKind[] = ['block', 'task', 'report', 'req'];

export interface DrawerParams {
  blockId: string | null;
  taskId: string | null;
  reportId: string | null;
  reqId: string | null;
  train: string | null;
  station: string | null;
  /** 0–6 plan day, null when absent or not a number */
  day: number | null;
  /** RBP week index, null when absent or not a number */
  week: number | null;
  /** Set ?<kind>=<id> (replace, other params kept). `opts.close` drops other drawer kinds in the same update. */
  open: (kind: DrawerKind, id: string, opts?: { close?: DrawerKind | DrawerKind[] }) => void;
  /** Remove ?<kind>; with no argument every drawer kind is removed (context params stay). */
  close: (kind?: DrawerKind) => void;
  /** Set or clear a context param (?train, ?station, ?day, ?week) without touching drawers. */
  set: (key: ContextKey, value: string | number | null) => void;
}

function intOrNull(v: string | null): number | null {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function useDrawerParams(): DrawerParams {
  const [params, setParams] = useSearchParams();

  const open = useCallback<DrawerParams['open']>(
    (kind, id, opts) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const closing = opts?.close === undefined ? [] : Array.isArray(opts.close) ? opts.close : [opts.close];
          for (const k of closing) if (k !== kind) next.delete(k);
          next.set(kind, id);
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const close = useCallback<DrawerParams['close']>(
    (kind) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (kind) next.delete(kind);
          else for (const k of DRAWER_KINDS) next.delete(k);
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const set = useCallback<DrawerParams['set']>(
    (key, value) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === '') next.delete(key);
          else next.set(key, String(value));
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const blockId = params.get('block');
  const taskId = params.get('task');
  const reportId = params.get('report');
  const reqId = params.get('req');
  const train = params.get('train');
  const station = params.get('station');
  const day = intOrNull(params.get('day'));
  const week = intOrNull(params.get('week'));

  return useMemo(
    () => ({ blockId, taskId, reportId, reqId, train, station, day, week, open, close, set }),
    [blockId, taskId, reportId, reqId, train, station, day, week, open, close, set]
  );
}
