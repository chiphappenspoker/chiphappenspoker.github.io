import { describe, it, expect, vi } from 'vitest';
import {
  encodePayoutShareData,
  decodePayoutShareData,
} from './payout-share';
import type { PayoutShareData } from '../types';

// In jsdom, CompressionStream/Blob.stream are missing; mock so encode uses j (base64) path
vi.mock('./compression', () => ({
  compressString: () => Promise.resolve(null),
  decompressToString: () => Promise.resolve(null),
}));

describe('payout-share', () => {
  const sample: PayoutShareData = {
    buyIn: '30',
    rows: [
      { name: 'Alice', in: '30', out: '50', settled: true },
      { name: 'Bob', in: '30', out: '10', settled: true },
    ],
  };

  describe('encodePayoutShareData', () => {
    it('produces string starting with z or j', async () => {
      const encoded = await encodePayoutShareData(sample);
      expect(encoded[0] === 'z' || encoded[0] === 'j').toBe(true);
      expect(encoded.length).toBeGreaterThan(1);
    });
  });

  describe('decodePayoutShareData', () => {
    it('roundtrips with encode (j or z format)', async () => {
      const encoded = await encodePayoutShareData(sample);
      const decoded = await decodePayoutShareData(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.buyIn).toBe(sample.buyIn);
      expect(decoded!.rows).toHaveLength(2);
      expect(decoded!.rows[0].name).toBe('Alice');
      expect(decoded!.rows[0].in).toBe('30');
      expect(decoded!.rows[0].out).toBe('50');
      expect(decoded!.rows[0].settled).toBe(true);
    });

    it('decodes j-prefixed base64url (uncompressed) payload', async () => {
      const json = JSON.stringify({
        v: 1,
        b: '30',
        r: [['Alice', '30', '50', 1], ['Bob', '30', '10', 1]],
      });
      const base64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const decoded = await decodePayoutShareData(`j${base64}`);
      expect(decoded).not.toBeNull();
      expect(decoded!.buyIn).toBe('30');
      expect(decoded!.rows).toHaveLength(2);
    });

    it('handles old-format backward compat (no z/j, raw base64)', async () => {
      const oldStyle = { buyIn: '30', rows: [{ name: 'A', in: '30', out: '40', settled: true }] };
      const b64 = btoa(JSON.stringify(oldStyle))
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
      const decoded = await decodePayoutShareData(padded);
      expect(decoded).not.toBeNull();
      expect(decoded!.buyIn).toBe('30');
      expect(decoded!.rows).toBeDefined();
    });

    it('returns null for invalid payload', async () => {
      expect(await decodePayoutShareData('invalid!!!')).toBeNull();
      expect(await decodePayoutShareData('')).toBeNull();
    });
  });
});
