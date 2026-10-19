# Radio

A single radio option — one-of-many selection within a RadioGroup.
3 sizes, single accent color, optional primary + sub label.

## Import

```tsx
import { Radio } from '@/components/ui/radio';
```

## Examples

```tsx
<div>
  {SIZES.map((size) => (
    <section key={size}>
      <div>{size}</div>
      <div
      >
        <div />
        {STATES.map((state) => (
          <div key={state}>
            {state}
          </div>
        ))}
        {LABEL_VARIANTS.map((variant) => (
          <RowFragment key={variant.key} size={size} variant={variant} />
        ))}
      </div>
    </section>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | Outer ring 16 / 20 / 24 px. |
| `value` | `string` | — | required (the option's value). |
| `label` | `ReactNode` | — | primary label (right of the ring); `subLabel: ReactNode` — secondary description below it. |
| `disabled` | `` | — | standard. |
| `id` | `` | — | standard. |

## When NOT to use

- Many options → Combobox.
- Multi-select → Checkbox in a CheckboxGroup.
- A standalone toggle → Switch. A radio must be part of a group of 2+.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
