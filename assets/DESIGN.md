# LNU Dormitory Portal: design system

Mirrors lnu.edu.ph: royal navy and gold, white surfaces, grey bands, Outfit type. All styles are in `assets/css/portal.css` and all behaviour in `assets/js/portal.js`. `assets/styleguide.html` shows every component and is a working reference page.

## 1. `<head>` snippet (copy exactly; change `../` to match the page's depth, e.g. `../../` for `dormer/*/`)
```html
<meta name="theme-color" content="#00006e">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="../assets/css/portal.css">
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js"></script>
<script src="../assets/js/portal.js"></script>  <!-- NO defer, must come last in <head> -->
```
Delete the old `<script src=".../portal.js">` at the end of `<body>`. If a page loads it twice, the second copy does nothing, but remove it anyway. Page scripts such as `attendance.js` stay at the end of `<body>`. If the CDN fails, the page still works: content shows within 2.5s and there is no motion.

## 2. Tokens (`:root`)
| Token | Value | Use |
|---|---|---|
| `--navy-900` / `--navy-800` / `--navy-700` | #03034f / #00006e / #0b0b86 | sidebar, header, primary buttons |
| `--indigo` / `--indigo-soft` | #2a2fb8 / #eaf2fd | gradient end, focus ring / info and callout background |
| `--gold` / `--gold-soft` / `--gold-tint` | #d9a92e / #e5b93c / #fbf3dc | rules, active indicator, gold button / selection |
| `--paper` / `--paper-2` | #fff / #f5f5f5 | cards / page and band background |
| `--ink` / `--ink-2` / `--muted` | #16161d / #33343f / #5b5e6b | headings / body / secondary text (6.4:1) |
| `--line` / `--line-strong` | #e4e4ea / #cfd0da | borders / input borders |
| `--on-navy` / `--on-navy-muted` | #fff / #c9cbf0 | text on navy (>= 6:1) |
| `--success` `--warning` `--danger` (+`-soft`) | #157347 #8a5300 #b42318 | status text on its `-soft` background (>= 5:1) |
| `--radius` / `--radius-sm` / `--radius-pill` | 20px / 12px / 999px | cards / inputs / pills |
| `--shadow-sm` `--shadow` `--shadow-lg`, `--ease-out` | cubic-bezier(.16,1,.3,1) | depth, motion |
Never hard-code colours in pages. Use `var(--token)`. Gold is never used for body text on white.

## 3. Component catalog
| Class | Usage |
|---|---|
| `.auth-page > .auth-layout > .auth-aside + .auth-main` | sign-in/register split card; aside is a navy hero with seal watermark and animated lines |
| `.app-shell > .sidebar + .main-content` | dashboard layout; `.sidebar > .brand + .nav (a[aria-current="page"]) + .sidebar-footer` |
| `.topbar > .page-heading > h1 + p` | page title block |
| `.site-header` | optional navy top bar with a gold rule |
| `.brand` / `img.brand-mark` | logo lockup (round seal with a gold ring) |
| `.button` + `.primary` `.navy` `.gold` `.secondary` `.outline` `.ghost` (+`.small` `.full`) | pill buttons, uppercase. Inside navy surfaces, `.secondary` turns gold and `.ghost`/`.outline` turn white |
| `.field` (+`.full`), `.form-grid`, `.field-hint`, `.field-error` | label wraps input/select/textarea |
| `.panel`, `a.panel` | 20px card; a linked panel lifts and shows a gold bottom rule on hover |
| `.content-stack`, `.summary-grid`, `.violation-grid`, `.card-grid` | vertical stack / 3-column / 2-column / auto-fill grids |
| `.status-panel` (+`.identity`, `.status-chip`) | navy gradient summary panel |
| `.stat-value`, `.stat-label` | big navy number + small caps label |
| `.eyebrow` (+`.gold`) | tiny letter-spaced uppercase label above a heading |
| `.section-heading` (+`.center`) > `.eyebrow + h2 + p` | section title block |
| `.tagline` | `INTEGRITY \| EXCELLENCE \| SERVICE` wide tracking |
| `.hero-band` (+`.flush`) | navy gradient, diagonal pattern, seal watermark, animated canvas lines |
| `.band` (+`.white`), `.callout` | grey section band / light-blue to white notice panel |
| `.feature-card > .feature-card-media(img) + .feature-card-body > .meta + h3 + p` | announcement card with a gold bottom border; add `a.stretched` in h3 to make the whole card a link |
| `.meta > time + span` | "DATE • CATEGORY" row |
| `.data-table > table` (+`td.num`) | bordered table; any `.table-wrap > table` still works |
| `.badge` + `-success` `-warning` `-danger` `-info` `-navy` `-gold` `-outline` | status pills |
| `.empty-state` (on `td`, or `div.empty-state > .empty-state-icon(svg) + h3 + p`) | empty results |
| `.skeleton` + `.skeleton-title` `-text` (`.short`) `-block` `-circle` | loading placeholders |
| `Portal.toast(msg, {type:'success'\|'danger'\|'warning', duration})` | toast notice; `.toast-stack` is created automatically |
| `<dialog class="dialog">` > `.dialog-header` `.dialog-body` `.dialog-actions`; `.icon-button` | modal: open with `[data-dialog-open="id"]` or `Portal.openDialog(id)`, close with `[data-dialog-close]`, Esc, or a backdrop click |
| `.modal[hidden] > .modal-content.panel` | legacy overlay (attendance QR); toggle `hidden` |
| `.sr-only`, `.tabular`, `.skip-link` | utilities |

## 4. Body conventions (motion)
- `data-reveal`: fade and 12px rise when scrolled into view. Applied automatically to `.content-stack > .panel`, `.summary-grid > .panel`, `.violation-grid > .panel` and `.card-grid > .feature-card`. Do not add it to nav items, table rows, or anything inside a modal.
- `data-hero` on the hero container (`.hero-band` or `.auth-aside`): its direct children animate in order. The `h1` (or the element marked `[data-split]`) is split into words; elements before it fade in, elements after it rise. Use one per page.
- `data-count="1234"` on a number: counts up when visible. Keep the final value as the text, too. Optional: `data-count-decimals`, `data-count-prefix="₱"`, `data-count-suffix="%"`.
- `data-hero-lines`: adds the animated diagonal-line canvas to any other navy element (`.hero-band` and `.auth-aside` get it automatically).
- `data-no-magnet` on a `.button`: turns off the magnetic hover. `.full` buttons are never magnetic.
- `data-lenis-prevent` (or `data-scroll-container`): put it on custom inner scroll areas. `.modal`, `.history-content` and `dialog` already have it.
- After inserting content dynamically, call `Portal.refresh()`. `Portal.lenis` exposes the Lenis instance (or `null`).
- Timing: UI motion stays at or under 300ms (press `scale .97`, 140ms). The hero entrance takes about 0.9s and count-up takes 0.8s. Everything is off under `prefers-reduced-motion`.
