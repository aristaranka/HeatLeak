# Selectable Card

Three selectable-card flavors — plain toggle, radio-controlled, checkbox-controlled — sharing one
media + layout shell but differing in ARIA role.

## Import

```tsx
import { CardSelectable, SelectableCard, RadioCard, CheckboxCard } from '@/components/ui/card-selectable';
```

## Examples

### Example 1

```tsx
<div>
  <SelectableCard selected>
    <span>Plain</span>
  </SelectableCard>
  <RadioGroup defaultValue="a">
    <RadioCard value="a">
      <span>Radio</span>
    </RadioCard>
  </RadioGroup>
  <CheckboxCard defaultChecked>
    <span>Checkbox</span>
  </CheckboxCard>
</div>
```

### Example 2

```tsx
<RadioGroup defaultValue="basic">
  <RadioCard value="basic">
    <span>Basic</span>
  </RadioCard>
  <RadioCard value="pro">
    <span>Pro</span>
  </RadioCard>
</RadioGroup>
```

### Example 3

```tsx
<div>
  <CheckboxCard>
    <span>Email notifications</span>
  </CheckboxCard>
  <CheckboxCard>
    <span>SMS notifications</span>
  </CheckboxCard>
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `media` | `none \| top \| left` | `none` | Matches the Figma "Media Location" variant. |
| `mediaContent` | `ReactNode` | — | rendered edge-to-edge in the media slot when `media` isn't `none`. Omit to render no media block at all. |
| `selected` | `boolean` | `false` | Controlled only — there's no Radix state to fall back on for this flavor. |
| `onSelectedChange` | `(selected: boolean) => void` | — | called with the next value on click, alongside any `onClick` you also pass. |
| `value` | `` | — |  |
| `disabled` | `` | — |  |
| `checked` | `` | — | standard Radix Checkbox API. |
| `defaultChecked` | `` | — | standard Radix Checkbox API. |
| `onCheckedChange` | `` | — | standard Radix Checkbox API. |
| `disabled` | `` | — | standard Radix Checkbox API. |

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
