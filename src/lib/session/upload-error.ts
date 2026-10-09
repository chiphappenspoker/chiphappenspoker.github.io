/** Map raw upload/save failures to a short user-facing message. */
export function formatUploadError(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/row-level security|42501/i.test(message)) {
    return 'Upload blocked — check Pro status or session limit';
  }
  if (/failed to fetch|networkerror|network|timeout|abort|load failed/i.test(message)) {
    return 'Upload failed. Check your connection.';
  }
  if (message.trim()) {
    return `Upload failed: ${message}`;
  }
  return 'Upload failed. Please try again.';
}
