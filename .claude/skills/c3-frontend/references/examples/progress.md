# Progress

A horizontal progress / meter bar — a neutral track with an accent fill sized to a 0–100 value, in
three thicknesses.

## Import

```tsx
import { Progress } from '@/components/ui/progress';
```

## Examples

### Example 1

```tsx
<div>
  <Progress value={value} size={size} />
</div>
```

### Example 2

```tsx
<div>
  {SIZES.map((size) => (
    <div key={size}>
      <div>
        {size}
      </div>
      {VALUES.map((value) => (
        <div key={value}>
          <Progress value={value} size={size} />
          <span>
            {value}%
          </span>
        </div>
      ))}
    </div>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `number` | — | 0–100, clamped. Default `0`. |
| `size` | `sm \| md \| lg` | — | track thickness 6 / 8 / 12 px. Default `md`. |

## When NOT to use

- Indeterminate / spinner loading — use a spinner (Button `loading`).
- A user-adjustable value — that's a slider (not in the library yet).

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
