import { describe, it, expect } from 'vitest';
import { formatUploadError } from './upload-error';

describe('formatUploadError', () => {
  it('maps network failures to the connection message', () => {
    expect(formatUploadError(new Error('Failed to fetch'))).toBe(
      'Upload failed. Check your connection.'
    );
    expect(formatUploadError(new Error('network timeout'))).toBe(
      'Upload failed. Check your connection.'
    );
  });

  it('maps RLS failures to the Pro/limit message', () => {
    expect(formatUploadError(new Error('new row violates row-level security policy'))).toBe(
      'Upload blocked — check Pro status or session limit'
    );
  });

  it('surfaces other messages instead of a generic connection blame', () => {
    expect(formatUploadError(new Error('session_not_found'))).toBe(
      'Upload failed: session_not_found'
    );
  });

  it('uses a generic retry message when empty', () => {
    expect(formatUploadError(null)).toBe('Upload failed. Please try again.');
  });
});
