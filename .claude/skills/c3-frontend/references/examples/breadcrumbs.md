# Breadcrumbs

A data-driven navigation trail with 2 sizes, auto-collapse at 5+ levels, and optional per-item icon
/ badge / dropdown slots.

## Import

```tsx
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
```

## Examples

### Example 1

```tsx
<div>
  {SIZES.map((size) => (
    <section key={size}>
      <h3>
        {size}
      </h3>
      <div>
        {[2, 3, 4, 5].map((n) => (
          <div key={n}>
            <div>
              {n} levels
            </div>
            <Breadcrumbs size={size} items={trail(n)} />
          </div>
        ))}
      </div>
    </section>
  ))}
</div>
```

### Example 2

```tsx
<Breadcrumbs
  items={[
    { label: "Home", href: "#", leadingIcon: <Home /> },
    { label: "Projects", href: "#", hasDropdown: true },
    { label: "Sensors", href: "#", badge: "12" },
    { label: "Detail" },
  ]}
/>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `BreadcrumbItemData[]` | — | the ordered trail (root → current). Renders nothing below 2 entries. |
| `size` | `md \| lg` | `md` | Drives typography + icon size (12 / 16px) only. |

## When NOT to use

- In-page section switching → Tabs.
- A single-level page — Breadcrumbs renders nothing below 2 levels by design.
- As a primary nav menu — this is a trail, not a nav bar.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
