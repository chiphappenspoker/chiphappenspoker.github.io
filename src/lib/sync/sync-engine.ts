import { supabase } from '../supabase/client';
import { cloudRepository } from '../data/cloud-repository';
import { db } from './db';
import { getQueueEntries, removeQueueEntry } from './sync-queue';
import type { SettingsData } from '../types';
import type { DbGameSession, DbGamePlayer } from '../types';

let isProcessing = false;

async function processQueue(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  if (isProcessing) return;
  isProcessing = true;
  try {
    const entries = await getQueueEntries();
    for (const entry of entries) {
      if (!entry.id) continue;
      try {
        switch (entry.table) {
          case 'profiles': {
            const payload = entry.payload as unknown as SettingsData;
            await cloudRepository.saveSettings(payload);
            break;
          }
          case 'game_sessions': {
            const payload = entry.payload as unknown as DbGameSession;
            await cloudRepository.saveGameSession(payload);
            break;
          }
          case 'game_players': {
            const payload = entry.payload as unknown as DbGamePlayer;
            await cloudRepository.saveGamePlayer(payload);
            break;
          }
          default:
            break;
        }
        await removeQueueEntry(entry.id);
      } catch {
        // leave entry in queue for next online
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function pullFromCloud(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  try {
    const sessions = await cloudRepository.getGameSessions();
    await db.sessions.clear();
    await db.sessions.bulkPut(sessions);
    for (const session of sessions) {
      const players = await cloudRepository.getGamePlayers(session.id);
      for (const p of players) {
        await db.players.put(p);
      }
    }
  } catch {
    // ignore pull errors
  }
}

let onlineHandler: (() => void) | null = null;

export function startSyncEngine(): void {
  if (typeof window === 'undefined') return;
  const run = async () => {
    await processQueue();
    await pullFromCloud();
  };
  onlineHandler = run;
  window.addEventListener('online', run);
  if (navigator.onLine) {
    run();
  }
}

export function stopSyncEngine(): void {
  if (typeof window === 'undefined' || !onlineHandler) return;
  window.removeEventListener('online', onlineHandler);
  onlineHandler = null;
}
