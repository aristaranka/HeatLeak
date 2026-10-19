# RadioGroup

A vertical stack of Radio options. Owns keyboard
navigation and selection state. 3 sizes.

## Import

```tsx
import { RadioGroup } from '@/components/ui/radio-group';
```

## Examples

### Example 1

```tsx
<RadioGroup {...args}>
  <Radio size={args.size} value="apple" label="Apple" />
  <Radio size={args.size} value="orange" label="Orange" />
  <Radio size={args.size} value="banana" label="Banana" />
</RadioGroup>
```

### Example 2

```tsx
<div>
  {(["sm", "md", "lg"] as const).map((size) => (
    <div key={size}>
      <div>{size}</div>
      <RadioGroup defaultValue={`${size}-2`} size={size}>
        <Radio size={size} value={`${size}-1`} label="Option one" />
        <Radio size={size} value={`${size}-2`} label="Option two" />
        <Radio size={size} value={`${size}-3`} label="Option three" />
      </RadioGroup>
    </div>
  ))}
</div>
```

### Example 3

```tsx
<RadioGroup defaultValue="standard">
  <Radio value="standard" label="Standard" />
  <Radio value="express" label="Express" />
  <Radio value="overnight" label="Overnight" />
</RadioGroup>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | A hint (also `data-size` on the group); **pass it to each `Radio` too**. |
| `value` | `` | — | standard Radix RadioGroup. |
| `defaultValue` | `` | — | standard Radix RadioGroup. |
| `onValueChange` | `` | — | standard Radix RadioGroup. |
| `disabled` | `` | — | disables the whole group; `name` — form name for native submission. |

## When NOT to use

- Independent, combinable options → CheckboxGroup.
- Many options → Combobox.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
