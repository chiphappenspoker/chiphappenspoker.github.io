import { db } from './db';
import type { SyncQueueEntry } from './db';

export async function enqueue(
  table: string,
  operation: SyncQueueEntry['operation'],
  payload: Record<string, unknown>
): Promise<void> {
  await db.sync_queue.add({
    table,
    operation,
    payload,
    timestamp: Date.now(),
  });
}

export async function getQueueEntries(): Promise<SyncQueueEntry[]> {
  return db.sync_queue.orderBy('timestamp').toArray();
}

export async function removeQueueEntry(id: number): Promise<void> {
  await db.sync_queue.delete(id);
}

export async function clearQueue(): Promise<void> {
  await db.sync_queue.clear();
}

/** Remove pending sync entries for a session so Clear does not cause upserts. */
export async function clearQueueEntriesForSession(sessionId: string): Promise<void> {
  const entries = await getQueueEntries();
  for (const entry of entries) {
    if (!entry.id) continue;
    const payload = entry.payload as { id?: string; session_id?: string };
    const match =
      (entry.table === 'game_sessions' && payload.id === sessionId) ||
      (entry.table === 'game_players' && payload.session_id === sessionId);
    if (match) await removeQueueEntry(entry.id);
  }
}
