# Link

An inline, accent-colored text link with optional leading/trailing icons. Renders a semantic `a`
(or any element via `asChild`), with hover/active underline, a focus ring, and a disabled state.

## Import

```tsx
import { Link } from '@/components/ui/link';
```

## Examples

### Example 1

```tsx
<Link
  href="#"
  size={size}
  disabled={disabled}
  leadingIcon={leadingIcon ? <Heart /> : undefined}
  trailingIcon={trailingIcon ? <SquareArrowOutUpRight /> : undefined}
>
  {label}
</Link>
```

### Example 2

```tsx
<div
>
  {/* header row */}
  <div />
  {STATES.map((s) => (
    <div
      key={s.label}
    >
      {s.label}
    </div>
  ))}

  {/* one row per size */}
  {SIZES.map((size) => (
    <Fragment key={size}>
      <div>
        {size}
      </div>
      {STATES.map((s) => (
        // Wrap so the grid cell (not the Link) absorbs any column slack —
        // the inline-flex Link then hugs its own glyphs, no stretched box.
        <div key={s.label}>
          <Link
            href="#"
            size={size}
            disabled={s.disabled}
            trailingIcon={<SquareArrowOutUpRight />}
          >
            Link
          </Link>
        </div>
      ))}
    </Fragment>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | `sm` = L3 (12px) text + 12px icons; `md`/`lg` = L2 (14px) + 16px icons. |
| `leadingIcon` | `` | — | optional lucide glyphs (e.g. `SquareArrowOutUpRight` for external). |
| `trailingIcon` | `ReactNode` | — | optional lucide glyphs (e.g. `SquareArrowOutUpRight` for external). |
| `disabled` | `boolean` | — | drops `href`, sets `aria-disabled`, removes it from the tab order, dims to 50%. |
| `asChild` | `boolean` | — | render as a child element (e.g. a router `Link`) via Slot; icon slots are skipped in `asChild` mode. |
| `href` | `` | — |  |
| `target` | `` | — |  |
| `rel` | `` | — |  |
| `onClick` | `` | — |  |

## When NOT to use

- A primary/secondary CTA → Button (incl. `variant="ghost"`).
- A breadcrumb trail → Breadcrumbs.
- A tab in a tab row → Tabs.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
