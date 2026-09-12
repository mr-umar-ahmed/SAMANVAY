/**
 * Hooks shared by the planning, control and division pages (kept apart from
 * the component files so fast refresh keeps working): the week's conflict
 * rows, the superseded-proposal rows, possessions past their planned end,
 * and the corridor switch with its confirmation dialog.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { blocksRunningPastEnd, conflictsFor, supersededProposals, type ConflictSeverity, type RunningLate, type WorkingBlock } from '../../engine/select';
import type { Snapshot } from '../../engine/types';
import { useAppStore } from '../../store/useAppStore';
import { addDaysIso } from '../../lib/format';
import { extraHardReasonRows, type ConflictRow } from './conflictText';
import { CorridorSwitchDialog } from './CorridorSwitchDialog';

/** Every conflict row of the working week (conflictsFor + the optimiser's extra hard reasons), most severe first. */
export function useConflictRows(snapshot: Snapshot, blocks: WorkingBlock[]): ConflictRow[] {
  const approvals = useAppStore((s) => s.approvals);
  const forms = useAppStore((s) => s.forms);
  const powerBlocks = useAppStore((s) => s.powerBlocks);
  const executionLog = useAppStore((s) => s.executionLog);
  return useMemo(() => {
    const base = conflictsFor(snapshot, blocks, approvals, null, { forms, powerBlocks, executionLog });
    const extra = extraHardReasonRows(snapshot, base);
    const order: Record<ConflictSeverity, number> = { high: 0, medium: 1, low: 2 };
    return [...(base as ConflictRow[]), ...extra].sort((a, b) => order[a.severity] - order[b.severity] || (a.day ?? 99) - (b.day ?? 99) || a.id.localeCompare(b.id));
  }, [snapshot, blocks, approvals, forms, powerBlocks, executionLog]);
}

export interface SupersededRow {
  blockId: string;
  held: boolean;
  status: string;
  supersededAt: string | null;
  day: number | null;
  date: string | null;
  start: number | null;
  end: number | null;
  works: number;
  /** blocks of the current plan holding any of the same works */
  now: WorkingBlock[];
  /** of those, the ones proposeBlocks accepts (DRAFT / REFUSED) */
  sendable: WorkingBlock[];
}

/** Sent proposals changed by a re-plan, with the blocks that now hold the same works. */
export function useSupersededRows(snapshot: Snapshot, blocks: WorkingBlock[]): SupersededRow[] {
  const approvals = useAppStore((s) => s.approvals);
  return useMemo(
    () =>
      supersededProposals(approvals).map((p) => {
        const ids = new Set(p.geometry?.taskIds ?? []);
        const now = blocks.filter((b) => b.tasks.some((x) => ids.has(x.id)));
        return {
          blockId: p.blockId,
          held: p.held,
          status: p.approval.status,
          supersededAt: p.approval.supersededAt ?? null,
          day: p.geometry?.day ?? null,
          date: p.geometry?.date ?? (p.geometry ? addDaysIso(snapshot.planStart, p.geometry.day) : null),
          start: p.geometry?.start ?? null,
          end: p.geometry?.end ?? null,
          works: p.geometry?.taskIds.length ?? 0,
          now,
          sendable: now.filter((b) => b.state === 'DRAFT' || b.state === 'REFUSED'),
        };
      }),
    [approvals, blocks, snapshot.planStart]
  );
}

/** Possessions started, not cleared and past their planned (or extended) end at (day, minute). */
export function useRunningPastEnd(blocks: WorkingBlock[], minute: number, day: number): RunningLate[] {
  const executionLog = useAppStore((s) => s.executionLog);
  return useMemo(() => blocksRunningPastEnd(blocks, executionLog, minute, day), [blocks, executionLog, minute, day]);
}

/**
 * const { request, dialog } = useCorridorSwitch();
 * request('WR_MMCT_ADI') opens the confirmation with the counts of what the switch clears; render {dialog} once.
 */
export function useCorridorSwitch(): { request: (id: string) => void; dialog: ReactNode } {
  const [target, setTarget] = useState<string | null>(null);
  const request = useCallback((id: string) => {
    if (id && id !== useAppStore.getState().corridorId) setTarget(id);
  }, []);
  const dialog = useMemo(() => (target ? <CorridorSwitchDialog target={target} onClose={() => setTarget(null)} /> : null), [target]);
  return { request, dialog };
}
