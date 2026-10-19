# InputNumber

A numeric input with optional minus/plus stepper buttons flanking a centered numeric field, inside
one bordered frame.

## Import

```tsx
import { InputNumber } from '@/components/ui/input-number';
```

## Examples

### Example 1

```tsx
<div>
  <InputNumber
    key={`${defaultValue}-${interactiveState}`}
    size={size}
    appearance={appearance}
    disabled={isDisabled}
    defaultValue={defaultValue}
  />
</div>
```

### Example 2

```tsx
<div>
  {(["sm", "md", "lg"] as const).map((size) => (
    <div key={size}>
      <div>
        Size: {size}
      </div>
      <div
      >
        <div />
        {STATES.map((s) => (
          <div
            key={s.label}
          >
            {s.label}
          </div>
        ))}
        {APPEARANCES.map((t) => (
          <React.Fragment key={t}>
            <div>
              {t}
            </div>
            {STATES.map((s) => (
              <InputNumber
                key={`${size}-${t}-${s.label}`}
                size={size}
                appearance={t}
                disabled={s.disabled}
                defaultValue={0}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | (heights match Input). |
| `appearance` | `default \| success \| danger` | `default` |  |
| `incrementButtons` | `boolean` | `true` | Hide for a stepperless numeric field. |
| `onIncrement` | `` | — | optional; if omitted, the component bumps ±1 itself. |
| `onDecrement` | `() => void` | — | optional; if omitted, the component bumps ±1 itself. |
| `min` | `` | — |  |
| `max` | `` | — |  |
| `step` | `` | — |  |
| `placeholder` | `` | — |  |

## When NOT to use

- Free-typing numbers without ± → `Input`.
- Large-range values → a slider.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
