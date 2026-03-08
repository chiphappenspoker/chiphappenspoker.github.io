import { describe, it, expect } from 'vitest';
import { toBase64Url, fromBase64Url } from './encoding';

describe('encoding', () => {
  it('roundtrips bytes via base64url', () => {
    const bytes = new TextEncoder().encode('hello world');
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = fromBase64Url(encoded);
    expect(new TextDecoder().decode(decoded)).toBe('hello world');
  });

  it('uses URL-safe chars (no + or /)', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00]);
    const encoded = toBase64Url(bytes);
    expect(encoded).toMatch(/[-_]/);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
});
