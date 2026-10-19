# Popover

A positioning primitive. Anchors a floating layer to a trigger with collision detection, portal
rendering, and dismissal — no opinions on the content inside.

## Import

```tsx
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription } from '@/components/ui/popover';
```

## Examples

```tsx
<div>
  <p>
    12 placements — side (top/right/bottom/left) × align (start/center/end).
    Mirrors Figma node 45355-1640.
  </p>
  {SIDES.map((side) => (
    <section key={side}>
      <div>side={side}</div>
      <div>
        {ALIGNS.map((align) => (
          <div
            key={align}
          >
            <div>align={align}</div>
            <PositionCell side={side} align={align} />
          </div>
        ))}
      </div>
    </section>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `side` | `top \| right \| bottom \| left` | — | Radix default `bottom`. |
| `align` | `start \| center \| end` | `center` |  |
| `sideOffset` | `8` | `true` |  |
| `collisionPadding` | `8` | `true` |  |
| `avoidCollisions` | `` | `true` |  |

## When NOT to use

- Modal dialogs (backdrop + focus trap) → Modal.
- Text-on-hover → Tooltip.
- Toasts / notifications — different lifecycle.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
