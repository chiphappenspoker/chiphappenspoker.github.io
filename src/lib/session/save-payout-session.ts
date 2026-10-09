import { parseNum } from '@/lib/calc/formatting';
import type {
  DbGamePlayer,
  DbGameSession,
  PayoutRowData,
  SaveOwnSessionPayload,
  SaveOwnSessionResult,
  SharedSessionPayload,
} from '@/lib/types';

export type SavePayoutSessionParams = {
  repo: {
    saveOwnSession(payload: SaveOwnSessionPayload): Promise<SaveOwnSessionResult | null>;
    saveGameSession(session: DbGameSession): Promise<DbGameSession | null>;
    saveGamePlayer(player: DbGamePlayer): Promise<void>;
    getGameSession(sessionId: string): Promise<DbGameSession | null>;
    getGroupMembersWithIds(groupId: string): Promise<{ name: string; user_id: string }[]>;
    getGamePlayers(sessionId: string): Promise<DbGamePlayer[]>;
    deleteGamePlayer(playerId: string, sessionId: string): Promise<void>;
  };
  userId: string;
  rows: PayoutRowData[];
  buyIn: string;
  currency: string;
  settlementMode: string;
  selectedGroupId: string | null;
  currentSessionId: string | null;
  status: 'active' | 'settled';
  shareCode: string | null;
  useSharedRpc: boolean;
  upsertSharedSession?: (code: string, payload: SharedSessionPayload) => Promise<string | null>;
};

export type SavePayoutSessionResult =
  | { ok: true; sessionId: string; playerIds: (string | undefined)[]; shareCode: string; createdBy: string }
  | { ok: false; error: string };

export async function savePayoutSession(params: SavePayoutSessionParams): Promise<SavePayoutSessionResult> {
  const {
    repo,
    userId,
    rows,
    buyIn,
    currency,
    settlementMode,
    selectedGroupId,
    currentSessionId,
    status,
    shareCode,
    useSharedRpc,
    upsertSharedSession,
  } = params;
  if (!userId || rows.length === 0) {
    return { ok: false, error: 'Upload failed. Please try again.' };
  }

  const now = new Date().toISOString();
  const sessionId = currentSessionId ?? crypto.randomUUID();

  const nameToUserId = new Map<string, string>();
  if (selectedGroupId) {
    const members = await repo.getGroupMembersWithIds(selectedGroupId);
    for (const m of members) {
      if (m.name?.trim()) nameToUserId.set(m.name.trim().toLowerCase(), m.user_id);
    }
  }

  const playerIds: (string | undefined)[] = [];
  const sharedPlayers: SharedSessionPayload['players'] = [];

  for (const row of rows) {
    const name = row.name.trim();
    const playerId = name ? (row.dbPlayerId ?? crypto.randomUUID()) : undefined;
    playerIds.push(playerId);
    if (playerId === undefined) continue;

    const buyInNum = parseNum(row.buyIn);
    const cashOutNum = parseNum(row.cashOut);
    const userIdForPlayer = nameToUserId.get(name.toLowerCase()) ?? null;

    sharedPlayers.push({
      id: playerId,
      player_name: name,
      buy_in: buyInNum,
      cash_out: cashOutNum,
      net_result: cashOutNum - buyInNum,
      settled: row.paid ?? row.settled,
      user_id: userIdForPlayer,
      created_at: now,
    });
  }

  if (shareCode && useSharedRpc && upsertSharedSession) {
    const id = await upsertSharedSession(shareCode, {
      default_buy_in: buyIn,
      currency,
      settlement_mode: settlementMode,
      status,
      players: sharedPlayers,
    });
    if (!id) return { ok: false, error: 'Upload failed. Please try again.' };
    return { ok: true, sessionId: id, playerIds, shareCode, createdBy: '' };
  }

  const saved = await repo.saveOwnSession({
    id: sessionId,
    group_id: selectedGroupId,
    session_date: new Date().toISOString().slice(0, 10),
    currency,
    default_buy_in: buyIn,
    settlement_mode: settlementMode,
    status,
    players: sharedPlayers,
  });
  if (!saved) {
    return { ok: false, error: 'Upload failed. Please try again.' };
  }

  return {
    ok: true,
    sessionId: saved.session_id,
    playerIds,
    shareCode: saved.share_code?.trim() || shareCode?.trim() || '',
    createdBy: userId,
  };
}
