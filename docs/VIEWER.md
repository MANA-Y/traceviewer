# Presentation viewer notes

Audience chrome and scroll behavior for `presentation-mode`. After CSS/JS
changes, run `npm run build` so `traceviewer serve` / `traceviewer dev` pick
up new hashed assets in `dist/`.

## 2026-08-20

- Presenter is the shared deck and primary control. Notes are optional:
  `N` or the printed Notes URL opens `view=notes` on a phone or second window.
  Both presenter sockets can send `set_step`; opening notes does not reset the
  step. Live audience keystrokes and the timeline do not change the shared step.
- The landing page and `G` open a file picker with drag-and-drop. A snapshot
  URL remains optional; local JSON files use an in-memory object URL so reload
  asks the user to choose the file again. Presenter comments are private notes
  stored per step in `localStorage`.
- Shortcut help (`?`) and presentation settings (`S`, gear) sit in the bottom
  timeline bar. They no longer float over the slider. The landing page keeps
  the theme control in the page body; during a talk, theme lives in settings.
- The current-step highlight is a quiet full-bleed tint from the screen edges,
  without an extra outline. Theme uses 10% black by day and 10% white by night.
- Presentation settings use a left nav: Presentation, Interface, and Other.
  Theme, text size, images, step highlight, line numbers, and heading pin live
  under Interface; section scroll and reveal are under Presentation. Those
  values persist in `localStorage`.
- Lines are grouped by `section()`. Future sections are not shown, so empty
  section wrappers no longer draw a stack of divider lines. There is no
  `border-top` between sections.
- Unrevealed lines in animate mode collapse (`height: 0`, children
  `display: none`) and do not reserve space.
- Entering a section heading scrolls that section to the top of the window
  (`window.scrollTo`). While a section is still filling from the top, later
  blocks are not chased. Oversized blocks scroll only after their images have
  loaded.
- Structured renderers (tables, charts, timelines, callouts, sections) are eager imports,
  so table height no longer pops in after a Suspense placeholder. Images use
  `loading="eager"`.
- Overlay click no longer crops or zooms. Image crop uses the viewport aspect
  ratio and stage geometry, not a CSS transform.

## PDF export

`PDF style` in the settings dialog picks the layout, and the choice persists
with the other presentation settings (`data-pdf-style` on the root element):

- `Book` (default) prints one continuous text flow: serif typography, numbered
  chapters from section titles, flat hairline blocks, book-style tables, and
  numbered figure captions. Sections do not start a new page, so pages fill up
  instead of ending in white space. Only full-measure prose is justified —
  justifying a narrow column opens rivers. The `Center headings` and
  `Center blocks` preferences are screen choices and are ignored here, because a
  centred title over left-aligned body text makes lists look broken on paper.
- `Slides` keeps the on-screen deck look — cards, screen typography, centring
  preferences — and puts every section on its own page.

Both styles share the same print skin: light terminals, wrapped code, charts
scaled to the page, and no shadows. Speaker `notes()` and private step comments
print as a bubble with its tail pointing back at the block they comment on, so
the author's voice never blends into the body text. Image overlay dots stay on
the figure and their titles and text become a numbered key under the caption, so
labels never cover or squeeze the picture. Print also expands cropped `focus`
regions.

Card grids (`metrics`, `columns`, grid `steps`) pick a column count that fills
every row (`balancedColumns`), instead of letting auto-fit drop a single orphan
card onto a new row.

## Bottom bar

`Timeline` is a three-column footer: step `n / N`, range with section
markers, then settings and help buttons. Theme lives in the settings dialog.
The help dialog and `?` key are unchanged.

## Section grouping

`compileTrace` assigns `sectionGroupId` on each `section()` rendering.
`renderLines` wraps groups in `.presentation-section`. Only the current and
past groups are visible; `.is-future` and groups with only cloaked lines are
`display: none`.
