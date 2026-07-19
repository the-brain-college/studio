# Responsive design standards — The Brain College studio

The studio must render perfectly on **phone (≈390px)**, **tablet (≈768px)** and **desktop (≥1280px)**.
"Perfectly" is a rendered property, so it is verified by *looking* at the three widths — never by
reading classes alone. These are the rules every component follows; a change that violates one is a bug.

## Breakpoints (Tailwind defaults, one source of truth)
- `base` — phone, portrait. Design here FIRST, then add larger-screen overrides.
- `sm` 640 — large phone / small tablet portrait.
- `md` 768 — tablet. **The sidebar becomes permanent (264px) at `md`**, so a page's own content
  box is only ≈`768 − 264 = 500px` wide on a portrait tablet. Dense multi-column layouts must not
  assume the full viewport here — gate wide grids at `lg`, not `md`.
- `lg` 1024 / `xl` 1280 / `2xl` 1536 — laptop → desktop. Widen grids here.

## The seven rules

1. **No hover-only controls.** Any action a user must reach (play, open, download, select, cancel)
   must be operable on touch, where `:hover` never fires. Reveal-on-hover is a desktop *enhancement*
   only. Pattern: show the control by default (or on tap) and use `@media (hover:hover)` to fade it
   in on pointer devices — never the reverse. The `touch-actions` utility below encodes this.

2. **Rows wrap or truncate — never overflow.** A horizontal `flex` packing badges, dates and buttons
   gets `flex-wrap`, OR its flexible text child gets `min-w-0 truncate` and its fixed children get
   `shrink-0`. `body{overflow-x:hidden}` HIDES overflow; it does not prevent a control being pushed
   off-screen. Fix the source.

3. **No fixed width wider than the phone content box (~340px usable).** Prefer `w-full`, `max-w-*`,
   `min-w-0`, `basis`/`flex-1`. A fixed `min-w-[Npx]` on a table/grid must be gated so it only applies
   at a width that fits it (e.g. `lg:min-w-[880px]`), with a stacked fallback below.

4. **Grids collapse.** Multi-column grids step down to 1–2 columns on phone
   (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`), and wide data grids (calendar, tables) get a
   dedicated stacked/agenda view below `lg`.

5. **Type stays in range.** Body/label text never below **11px**; page titles use the fluid
   `text-display`/`text-h2/3` clamp tokens so they shrink on phones. No hardcoded `text-[10px]`.

6. **Modals & players fit the viewport.** Full height on phone (`h-full`, no rounded corners),
   centered + `max-h-[90vh]` + internal scroll at `sm+`. The media is height-capped
   (`min(58vh, …)`) so video + controls + footer fit without page scroll.

7. **Touch targets ≥ 36px, and every control shows `cursor:pointer`** (already global in `app.css`).

## Shared utilities (defined in `src/styles/app.css`)
- `touch-actions` — a card's action layer: visible by default on touch, fades in on hover for
  pointer devices. Use instead of bare `opacity-0 group-hover:opacity-100`.
- `no-hover:` / `can-hover:` variants — `@media (hover:none)` / `@media (hover:hover)` wrappers for
  one-off cases.

## Verification checklist (run before merge)
At 390 / 768 / 1280, on every route + every modal: no horizontal scroll on `<body>`; no control
clipped or off-screen; nothing overlaps; every button is tappable; titles shrink, labels ≥ 11px.
