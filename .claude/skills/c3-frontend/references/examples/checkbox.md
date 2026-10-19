# Checkbox

Boolean (or tri-state) form input with an optional inline label + sub-text. Built on Radix Checkbox.

## Import

```tsx
import { Checkbox } from '@/components/ui/checkbox';
```

## Examples

### Example 1

```tsx
<div>
  {(["sm", "md", "lg"] as const).map((size) => (
    <div key={size}>
      <div>{size}</div>
      <div>
        <Checkbox size={size} label="Unchecked" subText="Sub label" />
        <Checkbox size={size} label="Hover" subText="Sub label" />
        <Checkbox size={size} defaultChecked label="Checked" subText="Sub label" />
        <Checkbox size={size} defaultChecked="indeterminate" label="Indeterminate" subText="Sub label" />
        <Checkbox size={size} disabled label="Disabled unchecked" subText="Sub label" />
        <Checkbox size={size} defaultChecked disabled label="Disabled checked" subText="Sub label" />
      </div>
    </div>
  ))}
</div>
```

### Example 2

```tsx
<div>
  <Checkbox size="sm" />
  <Checkbox size="md" defaultChecked />
  <Checkbox size="lg" defaultChecked="indeterminate" />
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | Box sizes 16 / 20 / 24 px. |
| `checked` | `boolean \| "indeterminate"` | — | controlled tri-state. |
| `defaultChecked` | `boolean \| "indeterminate"` | — | uncontrolled. |
| `label` | `ReactNode` | — | optional. Renders L2 (14px medium) to the right of the box. |
| `subText` | `ReactNode` | — | optional. Renders P3 (12px regular) below the label. |
| `disabled` | `` | — | fades box + label to 50% opacity. |

## When to use

- Multi-select forms (filters, settings panels).
- Bulk-action row selectors in tables (top row uses `indeterminate` for partial selection).
- Boolean settings with explanatory `subText`.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
