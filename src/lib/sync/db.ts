import Dexie from 'dexie';
import type { DbGameSession, DbGamePlayer } from '../types';

export interface SyncQueueEntry {
  id?: number;
  table: string;
  operation: 'insert' | 'update' | 'upsert';
  payload: Record<string, unknown>;
  timestamp: number;
}

export class ChipHappensDb extends Dexie {
  declare sessions: Dexie.Table<DbGameSession, string>;
  declare players: Dexie.Table<DbGamePlayer, string>;
  declare sync_queue: Dexie.Table<SyncQueueEntry, number>;

  constructor() {
    super('chiphappens-db');
    this.version(1).stores({
      sessions: 'id, created_by, group_id, created_at',
      players: 'id, session_id, created_at',
      sync_queue: '++id, table, timestamp',
    });
  }
}

export const db = new ChipHappensDb();
