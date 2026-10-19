# Switch

Toggle for immediate-effect boolean settings. Solid + outline styles, 3 sizes, optional Check/X icon
in the track.

## Import

```tsx
import { Switch } from '@/components/ui/switch';
```

## Examples

```tsx
<div>
  {STYLES.map((style) => (
    <div key={style}>
      <Block style={style} withLabel={false} />
      <Block style={style} withLabel />
      <Block style={style} withLabel={false} withIcon />
    </div>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | Track widths 32 / 40 / 48 px. |
| `style` | `solid \| outline` | `solid` |  |
| `withIcon` | `boolean` | `false` | Renders a Check (checked) / X (unchecked) in the track opposite the knob. |
| `checked` | `` | — | standard Radix Switch props. |
| `defaultChecked` | `` | — | standard Radix Switch props. |
| `disabled` | `` | — | standard Radix Switch props. |
| `onCheckedChange` | `` | — | standard Radix Switch props. |

## When to use

- Immediate-effect toggles: dark mode, notifications on/off, feature flags in settings panels.
- Anywhere the user expects the change to apply without a "Save" button.

## When NOT to use

- Form fields that submit later — use Checkbox.
- More than two states — use a segmented control.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
