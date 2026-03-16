#!/usr/bin/env node
//
// Post-build script: scans out/ for all static assets produced by
// next build and injects them into the service worker's precache list.
//
// Replaces the placeholder /* __PRECACHE_ASSETS__ */ in out/sw.js
// and sets the CACHE_VERSION to a content-based hash so returning
// users automatically pick up new deploys.
//

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const OUT_DIR = join(process.cwd(), 'out');
const SW_PATH = join(OUT_DIR, 'sw.js');
const BASE_PATH = '';

// ── Collect every file under out/ ────────────────────────────────────────────
function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

const allFiles = walk(OUT_DIR)
  .map((f) => '/' + relative(OUT_DIR, f))  // e.g. /_next/static/chunks/xxx.js
  .filter((f) => {
    // Skip the SW itself and source maps
    if (f === '/sw.js') return false;
    if (f.endsWith('.map')) return false;
    return true;
  })
  .map((f) => `${BASE_PATH}${f}`);         // e.g. /ChipHappens/_next/static/chunks/xxx.js

// Also add the root URL (/) and the clean /side-pot URL
const urls = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/side-pot`,
  ...allFiles,
];

// Deduplicate
const unique = [...new Set(urls)].sort();

// ── Generate a content-based cache version ───────────────────────────────────
const hash = createHash('md5').update(unique.join('\n')).digest('hex').slice(0, 8);

// ── Inject into sw.js ────────────────────────────────────────────────────────
let sw = readFileSync(SW_PATH, 'utf-8');

// Replace placeholder with real array entries
const precacheArray = unique.map((u) => `          '${u}'`).join(',\n');
sw = sw.replace('/* __PRECACHE_ASSETS__ */', precacheArray);

// Replace cache version with content hash
sw = sw.replace(/__BUILD_HASH__/g, hash);

writeFileSync(SW_PATH, sw, 'utf-8');

console.log(`✓ Injected ${unique.length} URLs into sw.js (cache: v-${hash})`);
