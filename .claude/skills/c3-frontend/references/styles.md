# C3 Design System — Style Reference

## Styling Guidelines

- Use **Tailwind v4** utility classes for styling (config-less; tokens come from `src/globals.css`)
- Use `cn()` from `@/lib/utils` to compose conditional class names
- C3 design tokens are exposed as theme-aware utilities — prefer them over raw colors:
  - Surfaces: `bg-primary`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-success-weak`, `bg-danger-weak`, etc.
  - Text: `text-primary`, `text-secondary`, `text-muted-foreground`, `text-accent`, `text-success`, `text-danger`, `text-tertiary`, `text-inverse`
  - Borders: `border-weak`, `border-input`, `border-strong`
  - C3 component utilities: `c3-card` (use instead of hand-rolled card classes), `c3-page-skeleton-enter`, `c3-page-content-enter`
- Common Tailwind patterns:
  - Layout: `flex`, `grid`, `p-4`, `m-2`, `gap-4`
  - Responsive: `sm:`, `md:`, `lg:` prefixes
- Class-based dark mode is toggled on `<html>` via `useTheme()` from `@/hooks/useTheme` — call it once at the top of any page that should react to theme changes.
- For the full list of C3 CSS variables and custom Tailwind utilities, read `ui/react/src/tailwind/c3TailwindTheme.css`, `ui/react/src/tailwind/c3CustomUtilities.css`, and `ui/react/src/tailwind/vendorOverrides.css` — all three are always present in every package and imported via `globals.css`.

## ⛔ Never Hardcode Colors

**Wrong:**

```tsx
<span style={{ color: '#8b5cf6' }}>value</span>
<div style={{ backgroundColor: '#1f2937' }}>...</div>
<div className="bg-[#8b5cf6] text-[#1f2937]">...</div>
```

**Correct — use semantic Tailwind classes:**

```tsx
<span className="text-accent">value</span>
<div className="bg-primary">...</div>
```

This applies everywhere: JSX class names, inline `style` props, and chart config objects.

**Full semantic color class reference:**

| Class             | Light value | Dark value |
| ----------------- | ----------- | ---------- |
| `text-primary`    | gray-95     | gray-05    |
| `text-secondary`  | gray-65     | gray-45    |
| `text-accent`     | blue-60     | blue-40    |
| `text-success`    | green-60    | green-40   |
| `text-warning`    | yellow-50   | yellow-40  |
| `text-danger`     | red-60      | red-40     |
| `bg-primary`      | white       | gray-100   |
| `bg-secondary`    | gray-05     | gray-95    |
| `bg-tertiary`     | gray-10     | gray-90    |
| `bg-accent`       | blue-60     | blue-40    |
| `bg-accent-weak`  | blue-05     | blue-95    |
| `bg-success-weak` | green-05    | green-95   |
| `bg-warning-weak` | yellow-05   | yellow-95  |
| `bg-danger-weak`  | red-05      | red-95     |
| `border-weak`     | gray-30     | gray-70    |
| `border-primary`  | gray-60     | gray-40    |
| `border-accent`   | blue-60     | blue-40    |

## Border Radius

**The C3 design system uses very small radii. Never use `rounded-md`, `rounded-lg`, or `rounded-xl` on interactive controls or cards.**

| Token          | Value  | Use for                                                      |
| -------------- | ------ | ------------------------------------------------------------ |
| `rounded-xs`   | 2px    | Buttons, inputs, selects, dropdowns, filter triggers, badges |
| `rounded-sm`   | 4px    | Cards, panels, chart containers, table wrappers, modals      |
| `rounded-full` | 9999px | Progress bar fills, avatar circles, status dots only         |

**Wrong:**

```tsx
<button className="rounded-md ...">Save</button>
<input className="rounded-lg ..." />
```

**Correct:**

```tsx
<button className="rounded-xs ...">Save</button>
<input className="rounded-xs ..." />
<div className="rounded-sm ...">Card</div>
```

## Typography

| Use                     | Class                                          |
| ----------------------- | ---------------------------------------------- |
| Page title              | `text-2xl font-medium text-primary`            |
| Section heading         | `text-sm font-semibold text-primary`           |
| Card label / stat label | `text-sm text-secondary font-medium uppercase` |
| Large metric value      | `text-2xl font-semibold`                       |
| Body / description      | `text-sm text-secondary`                       |
| Caption / meta          | `text-xs text-secondary`                       |
| Code                    | `font-mono text-sm`                            |

## Responsive Layout Principles

Apply these when building any new page or component:

- **Mobile first**: default to a readable, tappable narrow layout; add `sm:`, `md:`, `lg:` breakpoints for larger screens.
- **`min-w-0` on flex/grid children** that hold text, inputs, tables, or charts — prevents overflow off-screen.
- **Dense control rows** (many filters/selects in one row): wrap the outer container with `min-w-0 overflow-x-auto` and the inner row with `flex flex-wrap items-center gap-2` so the row scrolls horizontally on narrow screens instead of squashing controls.
- **Section title + actions**: use `flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between` so title and buttons stack on mobile and sit side-by-side on `sm+`.
- **Do not drop behavior for layout**: when restructuring JSX for responsiveness, keep existing effects, callbacks, persistence, and props — only change structure and Tailwind classes.
