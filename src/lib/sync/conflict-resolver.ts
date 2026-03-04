/**
 * Last-write-wins: prefer the version with the later updated_at.
 * If server returns a conflict (e.g. 409), we could retry with server version
 * or overwrite with our payload. For Phase 2 we overwrite with our payload
 * (client wins when in conflict).
 */
export function resolveConflict(
  localPayload: Record<string, unknown>,
  serverPayload: Record<string, unknown> | null
): Record<string, unknown> {
  if (!serverPayload) return localPayload;
  const localAt = typeof localPayload.updated_at === 'string' ? new Date(localPayload.updated_at).getTime() : 0;
  const serverAt = typeof serverPayload.updated_at === 'string' ? new Date(serverPayload.updated_at).getTime() : 0;
  return localAt >= serverAt ? localPayload : serverPayload;
}
