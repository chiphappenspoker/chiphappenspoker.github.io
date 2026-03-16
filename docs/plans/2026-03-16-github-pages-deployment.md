# GitHub Pages Deployment Plan (chiphappenspoker.github.io)

> **For Claude:** Use this plan to implement deployment to https://chiphappenspoker.github.io.

**Goal:** Publish the ChipHappens Next.js app on GitHub Pages so it is available at https://chiphappenspoker.github.io (root URL).

**Architecture:** The app already uses static export (`output: 'export'`) and builds to `out/`. Existing `.github/workflows/deploy.yml` uploads `out` and uses GitHub Actions deploy-pages. The app is currently configured for a **subpath** (`/ChipHappens`) for a different GitHub user Pages URL. For a repo named `chiphappenspoker.github.io`, the site is served at the **root** of that domain, so we switch to root deployment (no basePath).

**Tech Stack:** Next.js 15 (static export), GitHub Actions, GitHub Pages, Supabase (env secrets).

---

## Prerequisites

- GitHub repo that will be (or is) named **`chiphappenspoker.github.io`**. For user/org Pages, the site URL is exactly `https://<user-or-org>.github.io` when the repo name is `<user-or-org>.github.io`. So the repo name must be `chiphappenspoker.github.io` for the target URL.
- Supabase project: you will add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as GitHub repository secrets.

---

## Task 1: Configure app for root deployment

The app currently uses `basePath: '/ChipHappens'` and `assetPrefix: '/ChipHappens/'`. For https://chiphappenspoker.github.io we serve at the root, so all path prefixes must be removed or made empty.

**Files to modify:**

- `next.config.mjs`
- `src/lib/constants.ts`
- `src/app/layout.tsx`
- `src/components/layout/ServiceWorkerRegistrar.tsx`
- `scripts/inject-precache.mjs`
- `public/sw.js`

**Step 1.1: Set basePath and assetPrefix to empty**

In `next.config.mjs`:

- Set `basePath: ''` (or remove; default is `''`).
- Set `assetPrefix: ''` (or remove).

**Step 1.2: Set BASE_PATH to empty**

In `src/lib/constants.ts`:

- Change `export const BASE_PATH = '/ChipHappens';` to `export const BASE_PATH = '';`.

**Step 1.3: Use BASE_PATH in layout metadata**

In `src/app/layout.tsx`:

- Import: `import { BASE_PATH } from '@/lib/constants';`
- Set `manifest: `${BASE_PATH}/manifest.webmanifest`` (or `'/manifest.webmanifest'` when BASE_PATH is '').
- Set `icons.icon` and `icons.apple` to `${BASE_PATH}/icons/app_icon.png` (or `'/icons/app_icon.png'`).

This keeps the app correct if BASE_PATH is ever changed again.

**Step 1.4: Register service worker at root**

In `src/components/layout/ServiceWorkerRegistrar.tsx`:

- Replace hardcoded `/ChipHappens/sw.js` and scope `/ChipHappens/` with root paths. Use BASE_PATH: register `${BASE_PATH || '/'}/sw.js` with scope `${BASE_PATH || '/'}` (ensure trailing slash for scope). So when BASE_PATH is `''`, register `/sw.js` with scope `/`.

**Step 1.5: Use empty BASE_PATH in precache script**

In `scripts/inject-precache.mjs`:

- Change `const BASE_PATH = '/ChipHappens';` to `const BASE_PATH = '';`.
- Ensure URL construction still works: `BASE_PATH + '/'` => `'/'`, and `BASE_PATH + path` => path when BASE_PATH is `''`.

**Step 1.6: Update service worker fallback paths**

In `public/sw.js`:

- Replace `/ChipHappens/side-pot` and `/ChipHappens/` and `/ChipHappens/index.html` with root equivalents: `/side-pot`, `/`, `/index.html`. Comment can say “root fallback for offline”.

**Step 1.7: Verify build and PWA**

- Run `npm run build`. Confirm `out/` is produced and contains `index.html` at root, `sw.js` at root, and `manifest.webmanifest` at root.
- Run `npx serve out` (or similar) and open `/`. Check that the app loads, manifest and icons resolve, and the service worker registers at `/sw.js` with scope `/`.

---

## Task 2: Update deploy workflow for chiphappenspoker.github.io

**Files to modify:**

- `.github/workflows/deploy.yml`

**Step 2.1: Set production site URL**

In `.github/workflows/deploy.yml`, under `env` for the build job:

- Set `NEXT_PUBLIC_SITE_URL: https://chiphappenspoker.github.io` (no trailing slash, or with slash—ensure `getSiteOrigin()` behavior is consistent; currently it strips trailing slash).

**Step 2.2: Keep Supabase secrets**

- Ensure the workflow still passes `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from GitHub secrets (already present). No code change if already there.

**Step 2.3: Remove or disable duplicate workflow**

- You have `.github/workflows/nextjs.yml` (sample) which also deploys to Pages and uses `./out`. To avoid two deployments, either delete `nextjs.yml` or disable it (e.g. remove `push`/`workflow_dispatch` or leave only one active). Prefer keeping a single workflow: `deploy.yml`.

---

## Task 3: GitHub repository configuration

**No code changes.** Do in GitHub UI.

**Step 3.1: Repo name**

- If the repo is not already named `chiphappenspoker.github.io`, rename it (Settings → General → Repository name). For user Pages, the site will be `https://<username>.github.io` only when the repo name is `<username>.github.io`; for org `chiphappenspoker`, repo must be `chiphappenspoker.github.io`.

**Step 3.2: Secrets**

- Settings → Secrets and variables → Actions. Add (if missing):
  - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key  
- `NEXT_PUBLIC_SITE_URL` is set in the workflow; no secret needed unless you want to override per environment.

**Step 3.3: Enable GitHub Pages**

- Settings → Pages → Build and deployment:
  - Source: **GitHub Actions** (not “Deploy from a branch”). The `deploy.yml` workflow will publish the `out` artifact.

---

## Task 4: Deploy and verify

**Step 4.1: Push and trigger workflow**

- Commit all changes. Push to the default branch (e.g. `main`). The “Deploy to GitHub Pages” workflow should run.

**Step 4.2: Check Actions**

- Actions → “Deploy to GitHub Pages” workflow. Confirm build job succeeds (npm ci, npm run build, upload-pages-artifact from `out`). Confirm deploy job runs and completes.

**Step 4.3: Open live site**

- Open https://chiphappenspoker.github.io (and https://chiphappenspoker.github.io/). Confirm the app loads, navigation works, and assets (icons, manifest, SW) load from the root. Test a few key flows (e.g. calculator, groups if applicable).

**Step 4.4: Optional local static check**

- After a successful build, you can run a local static server on `out` and assert root paths and SW scope behave the same as on Pages.

---

## Summary checklist

| Step | Action |
|------|--------|
| 1.1 | `next.config.mjs`: basePath `''`, assetPrefix `''` |
| 1.2 | `constants.ts`: BASE_PATH `''` |
| 1.3 | `layout.tsx`: manifest and icons use BASE_PATH |
| 1.4 | `ServiceWorkerRegistrar.tsx`: register SW at root using BASE_PATH |
| 1.5 | `inject-precache.mjs`: BASE_PATH `''` |
| 1.6 | `public/sw.js`: fallback paths to `/`, `/side-pot`, `/index.html` |
| 1.7 | `npm run build` + local serve of `out` to verify |
| 2.1 | `deploy.yml`: NEXT_PUBLIC_SITE_URL = https://chiphappenspoker.github.io |
| 2.2 | Keep Supabase secrets in workflow |
| 2.3 | Remove or disable `nextjs.yml` to avoid duplicate deploy |
| 3.1 | Repo name = `chiphappenspoker.github.io` |
| 3.2 | Add NEXT_PUBLIC_SUPABASE_* secrets |
| 3.3 | Pages → Source: GitHub Actions |
| 4.1–4.4 | Push, check Actions, verify live site |

---

## Alternative: Keep subpath deployment

If you prefer the app at **https://chiphappenspoker.github.io/ChipHappens/** instead of the root:

- Do **not** change basePath, assetPrefix, BASE_PATH, layout, SW, or precache script.
- In `deploy.yml` only set `NEXT_PUBLIC_SITE_URL: https://chiphappenspoker.github.io`.
- Still ensure repo name is `chiphappenspoker.github.io`, add secrets, and set Pages source to GitHub Actions. Homepage link would be https://chiphappenspoker.github.io/ChipHappens/.

This plan implements **root** deployment so the main URL is https://chiphappenspoker.github.io.
