# Divider

A 1px line for separating sections, list items, or panel zones. Horizontal or vertical.

## Import

```tsx
import { Divider } from '@/components/ui/divider';
```

## Examples

```tsx
<div>
  <section>
    <div>
      Horizontal
    </div>
    <div>
      <div>Section A</div>
      <Divider />
      <div>Section B</div>
      <Divider />
      <div>Section C</div>
    </div>
  </section>
  <section>
    <div>
      Vertical
    </div>
    <div>
      <div>Item 1</div>
      <Divider orientation="vertical" />
      <div>Item 2</div>
      <Divider orientation="vertical" />
      <div>Item 3</div>
    </div>
  </section>
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `orientation` | `horizontal \| vertical` | `horizontal` | Horizontal stretches to 100% width; vertical stretches to the parent's height (uses `align-self: stretch` in flex parents). |
| `decorative` | `boolean` | `false` | When true, renders `role="presentation"` instead of `role="separator"`. |

## When NOT to use

- Typography-driven breaks — use spacing tokens or a heading.
- When the container already gives a clear break (border, background change).
- Inline rules inside body copy — use a plain `hr`.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
