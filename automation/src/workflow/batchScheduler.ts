import type { Target } from '../types/target';
import { countTargets, loadTargetsChunk } from '../data/targetsRepository';

export interface BatchSchedulerOptions {
  slotStart: string;
  batchSize: number;
  wrap: boolean;
}

export interface BatchResolution {
  slot: number | null;
  effectiveSlot: number | null;
  offset: number;
  targets: Target[];
  totalRows: number;
}

export async function resolveBatch(
  filePath: string,
  options: BatchSchedulerOptions,
): Promise<BatchResolution> {
  const slot = computeSlot(options.slotStart);
  if (slot === null) {
    return { slot, effectiveSlot: null, offset: 0, targets: [], totalRows: 0 };
  }

  const batchSize = Math.max(1, options.batchSize);
  let offset = slot * batchSize;
  let effectiveSlot: number | null = slot;
  let totalRows = 0;

  if (options.wrap) {
    totalRows = await countTargets(filePath);
    const totalSlots = Math.max(1, Math.ceil(totalRows / batchSize));
    effectiveSlot = totalSlots > 0 ? slot % totalSlots : 0;
    offset = effectiveSlot * batchSize;
  }

  const targets = await loadTargetsChunk(filePath, offset, batchSize);

  if (!options.wrap) {
    totalRows = offset + targets.length;
  }

  return { slot, effectiveSlot, offset, targets, totalRows };
}

export function computeSlot(slotStart: string): number | null {
  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / 3_600_000);
}
