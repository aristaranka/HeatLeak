# Component examples index

Catalog of C3 design-system references for coding agents.

## How to use this folder

1. Read [`foundations.md`](./foundations.md) once (API axes, tokens vs Genesis `styles.md`, dark mode, icons).
2. Use this catalog, then open a `*.md` card for import path, usage JSX, props, and when-to-use.
3. Cards import from `@/components/ui/<name>`. Matching implementations live in [`ui/`](./ui/).
4. Shared `cn` helper backup: [`helpers/utils.ts`](./helpers/utils.ts) → copy to app `src/lib/utils.ts` if missing. CSS tokens: [`styles/`](./styles/).
5. Page chrome / layouts: [`page-layouts/`](./page-layouts/) (start with `AppShell` + List/Detail/Dashboard).
6. If the workspace is missing a file a card references, copy from `ui/` / `helpers/` / `styles/` as needed. Do not rewrite factories from scratch.

| File | Component | What it does |
| --- | --- | --- |
| [`action-group.md`](./action-group.md) | ActionGroup | The canonical, ordered action cluster — a button hierarchy (tertiary → secondary → primary), a divider, and a trailing icon/overflow group — shared by PageHeader, DataGridToolbar, and any container that needs standardized actions. |
| [`alert.md`](./alert.md) | Alert | Banner-style notification with a leading icon or avatar, title + description, and optional trailing action button + close. Three visual variants × five appearances. |
| [`avatar.md`](./avatar.md) | Avatar | A 32px user/entity glyph with three content types (image / initials / icon), two shapes, an optional border ring, and a status indicator dot. |
| [`badge.md`](./badge.md) | Badge | A small status/label widget: 4 variants × 2 sizes × 2 shapes × 7 appearances, plus optional icons, avatar, close, and a bare-dot `indicator` mode. |
| [`breadcrumbs.md`](./breadcrumbs.md) | Breadcrumbs | A data-driven navigation trail with 2 sizes, auto-collapse at 5+ levels, and optional per-item icon / badge / dropdown slots. |
| [`button.md`](./button.md) | Button | Primary action element with 4 variants × 5 colors × 3 sizes, plus icon-only sizes. The most-used primitive in the library. |
| [`calendar.md`](./calendar.md) | Calendar | Date-grid component built on react-day-picker. Renders inside DatePicker / DateRangePicker; rarely used standalone. |
| [`card.md`](./card.md) | Card | Generic content surface. Composable subcomponents (`CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`, `CardMedia`) cover all 27 content patterns in the Figma "Card Example" frame — 9 categories × 3 variances each — from a single, content-agnostic primitive. |
| [`checkbox.md`](./checkbox.md) | Checkbox | Boolean (or tri-state) form input with an optional inline label + sub-text. Built on Radix Checkbox. |
| [`checkbox-group.md`](./checkbox-group.md) | CheckboxGroup | Vertical stack of Checkbox options. Supports flat lists and nested trees, in 3 sizes. |
| [`combobox.md`](./combobox.md) | Combobox | Single-select typeahead. Looks like Input; the user types to filter the option list. Composes `Input` + `Listbox` inside a `Popover`. |
| [`container.md`](./container.md) | Container | A bordered card surface that wraps a header (title / subtitle / actions), a body, and an optional footer — the shell around tables, lists, and forms. |
| [`data-grid.md`](./data-grid.md) | DataGrid | A composable, presentational data table. Cell content is bring-your-own composition of existing primitives; sort, filter, and selection render state and emit callbacks — the consumer owns the data. |
| [`date-picker.md`](./date-picker.md) | DatePicker / DateRangePicker | A date trigger (calendar icon + value) that opens a Calendar popover. Single-date and range modes via two exports. |
| [`divider.md`](./divider.md) | Divider | A 1px line for separating sections, list items, or panel zones. Horizontal or vertical. |
| [`dropdown-menu.md`](./dropdown-menu.md) | DropdownMenu | An external trigger plus a popout that looks like a Listbox but carries menu semantics (`role="menu"`). Items perform actions — they don't persist a value. |
| [`header.md`](./header.md) | Header | A full-width header band for containers — cards, sections, forms, and pages. Title + optional subtitle, with slot-in decoration (icon/avatar), badges, an info icon, and a right-aligned action group. |
| [`input.md`](./input.md) | Input | Single-line text input with a bordered wrapper, optional leading/trailing icon slots, and three validation appearances. |
| [`input-file.md`](./input-file.md) | InputFile | A two-part file picker: a left "Upload" button + right filename area, sharing one bordered frame. Either side opens the native file picker. |
| [`input-frame.md`](./input-frame.md) | InputFrame | A label + body + helper-text wrapper for any input. Propagates color to all four label slots. |
| [`input-number.md`](./input-number.md) | InputNumber | A numeric input with optional minus/plus stepper buttons flanking a centered numeric field, inside one bordered frame. |
| [`input-search.md`](./input-search.md) | InputSearch | A specialization of Input with a baked-in left search icon and an optional clear (X) button that appears once the field has a value. |
| [`link.md`](./link.md) | Link | An inline, accent-colored text link with optional leading/trailing icons. Renders a semantic `a` (or any element via `asChild`), with hover/active underline, a focus ring, and a disabled state. |
| [`list-item.md`](./list-item.md) | ListItem | One row of a key/value list — an inline label + value, or a stacked layout with an optional avatar/icon and a right action. |
| [`list-item-group.md`](./list-item-group.md) | ListItemGroup | Stacks ListItem rows with a preset configuration (layout, emphasis, and dividers) supplied via context. |
| [`listbox.md`](./listbox.md) | Listbox | A bare list-of-selectable-items surface (`ul`). Owns selection + active-row state and keyboard nav; owns no positioning or popover chrome — the consumer wraps it with a Popover. Composable with `ListboxItem` / `ListboxHeader` / `ListboxSeparator`. |
| [`modal.md`](./modal.md) | Modal | Blocking overlay for confirmations and short-form workflows. Composed from a header (title + subtitle + close), a body, and a footer with an optional left-pinned tertiary action and a right-aligned primary + secondary action group. |
| [`multi-select.md`](./multi-select.md) | MultiSelect | Multi-select typeahead. Looks like Input; the user types to filter, and each committed value becomes a removable chip in the field. Composes a trigger frame + `Badge` chips + `Listbox` inside a `Popover`. |
| [`page-header.md`](./page-header.md) | Page Header | The full-width band at the top of a page: an optional breadcrumb trail, a title + description with right-aligned actions, an optional content region (stats / selects / KPI cards), and an optional tab row. |
| [`pagination.md`](./pagination.md) | Pagination | A presentational, controlled pager: previous / page-number / "more" / next controls, with an optional items-per-page select and range label for table footers. |
| [`popover.md`](./popover.md) | Popover | A positioning primitive. Anchors a floating layer to a trigger with collision detection, portal rendering, and dismissal — no opinions on the content inside. |
| [`progress.md`](./progress.md) | Progress | A horizontal progress / meter bar — a neutral track with an accent fill sized to a 0–100 value, in three thicknesses. |
| [`radio.md`](./radio.md) | Radio | A single radio option — one-of-many selection within a RadioGroup. 3 sizes, single accent color, optional primary + sub label. |
| [`radio-group.md`](./radio-group.md) | RadioGroup | A vertical stack of Radio options. Owns keyboard navigation and selection state. 3 sizes. |
| [`selectable-card.md`](./selectable-card.md) | Selectable Card | Three selectable-card flavors — plain toggle, radio-controlled, checkbox-controlled — sharing one media + layout shell but differing in ARIA role. |
| [`side-nav-bar.md`](./side-nav-bar.md) | SideNavBar | The vertical application rail — a 64px-wide column with a 1px right rule that stacks icon+label nav items, with a top primary section and a pinned bottom footer. |
| [`side-nav-panel.md`](./side-nav-panel.md) | SideNavPanel | A vertical navigation *tree* panel — header + collapsible folder groups + nested selectable leaf items + footer. Expands to 256px or collapses to a 36px rail. The label-rich counterpart to the icon-only SideNavBar. |
| [`side-nav-panel-v2.md`](./side-nav-panel-v2.md) | SideNavPanelV2 | The next-generation left navigation: a single collapsible surface that **merges** the legacy `SideNavBar` (icon rail) and `SideNavPanel` (tree). Expanded it is a 256px labeled tree; collapsed it is a 48px icon-only rail — the inverse of `SideNavBar`, which stays wide to fit text. |
| [`side-panel.md`](./side-panel.md) | SidePanel | A side-pinned container panel — header (title / subtitle / close) + flexible content + optional footer button stack. Presentational: the styled shell, not a dialog with its own open/close machinery. |
| [`switch.md`](./switch.md) | Switch | Toggle for immediate-effect boolean settings. Solid + outline styles, 3 sizes, optional Check/X icon in the track. |
| [`table.md`](./table.md) | Table | Lightweight, presentational table for inline content — docs tables, spec sheets, comparison grids embedded in prose. The static counterpart to DataGrid. |
| [`tabs.md`](./tabs.md) | Tabs | Switch between sibling views with two visual treatments: a raised pill row (`boxed`) or an underlined baseline (`bordered`). Three trigger sizes. |
| [`textarea.md`](./textarea.md) | Textarea | A multi-line text input — the same appearance model as Input, but with regular-weight text and vertical-only resize. |
| [`time-picker.md`](./time-picker.md) | TimePicker | A single-line typed time field — a Clock icon + an editable `hh:mm:ss A` string, validated on blur. Composes `Input` directly. |
| [`tooltip.md`](./tooltip.md) | Tooltip | A dark bubble overlay anchored to a trigger, with an optional caret arrow on any side and optional icon / avatar / subtitle slots. |
| [`top-nav-bar.md`](./top-nav-bar.md) | TopNavBar | The application chrome bar at the top of every screen — a 48px-tall, full-width bar with a logo + app name on the left, an optional search/tabs slot in the center, and a right-aligned action group. |

Synced: `82` ui files, `4` style files, `6` page layouts, plus `helpers/utils.ts` and `foundations.md`.

> Auto-generated by `npm run skills:examples`. Do not edit by hand.
