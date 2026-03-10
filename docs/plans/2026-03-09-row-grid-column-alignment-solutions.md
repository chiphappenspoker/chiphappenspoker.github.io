# Dynamic column alignment for swipe row grid – 3 solutions

## Problem
The payout/side-pot row grid (single-cell + CSS Grid for swipe-to-delete) uses its own column widths. These can drift from the table’s `<col>` widths, especially on mobile, so columns don’t align with the header and footer.

## Solution 1: Measure header and sync via CSS variables (JS-driven)
**Idea:** Use a ref on the table and, on mount and on resize, read the computed width of each header cell (or each `<col>`). Write those widths into CSS custom properties on the table (e.g. `--payout-col-1`, `--payout-col-2`, …). The row grid uses `grid-template-columns: var(--payout-col-1) var(--payout-col-2) ...`.

**Pros:** Alignment is exact; no duplicate width logic; works with any layout.  
**Cons:** Requires JS and resize observer; slight layout shift on first paint unless widths are measured early.

---

## Solution 2: Inner table with shared colgroup (table layout)
**Idea:** Keep the swipe row as one `<td colspan="6">`, but put the sliding content inside an inner `<table>` that has the same `<colgroup>` as the main table. Duplicate the colgroup markup in each row (or render it once and clone into each row). Use `table-layout: fixed` and `width: 100%` so the inner table’s columns match the outer table’s column algorithm.

**Pros:** Column widths are identical by construction; no JS.  
**Cons:** Duplicate colgroup per row (or clone logic); heavier DOM; styling tables and swipe-reveal together is trickier.

---

## Solution 3: Single source of truth with CSS variables (implemented)
**Idea:** Define column widths once as CSS custom properties on the table (e.g. `--payout-col-name`, `--payout-col-step`, `--payout-col-num`). Use the same variables in:
- the table’s `<col>` elements (e.g. `col.col-name { width: var(--payout-col-name); }`), and  
- the row grid (e.g. `grid-template-columns: var(--payout-col-name) var(--payout-col-step) ...`).

Set/override these variables in the same media queries used today so desktop, 768px, and 480px all stay in sync.

**Pros:** One place to change widths; no JS; grid and table always use the same values.  
**Cons:** Need to express both “name” and “number” columns in a way that works for both `col` (no `fr`) and grid (can use `fr`/`%`/ch); usually one variable per “logical” column is enough.

---

## Implementation choice (Solution 3 – done)
Solution 3 is implemented:

- **Payout:** `.page-payout-table` defines `--payout-col-name` (unset on desktop → auto/1fr), `--payout-col-step: 32px`, `--payout-col-num: 10ch`. `<col>` and `.payout-row-grid` use these. At 768px: `--payout-col-name: 35%`. At 480px: `--payout-col-name: 40%`, `--payout-col-num: 8ch`.
- **Side pot:** `.page-sidepot-table` defines `--sidepot-col-name`, `--sidepot-col-num`. Same pattern; media queries override variables only.
- Column alignment between header, body grid, and footer is driven by one set of variables, so it stays in sync on all breakpoints.
