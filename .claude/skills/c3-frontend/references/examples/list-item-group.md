# ListItemGroup

Stacks ListItem rows with a preset configuration
(layout, emphasis, and dividers) supplied via context.

## Import

```tsx
import { ListItemGroup } from '@/components/ui/list-item-group';
```

## Examples

### Example 1

```tsx
<Container>
  <ListItemGroup type="compact">
    {ROWS.map((r) => (
      <ListItem key={r} label="Label" value="Primary Value" />
    ))}
  </ListItemGroup>
</Container>
```

### Example 2

```tsx
<Container>
  <ListItemGroup type="normal">
    {ROWS.map((r) => (
      <ListItem key={r} label="Label" value="Primary Value" />
    ))}
  </ListItemGroup>
</Container>
```

### Example 3

```tsx
<Container>
  <ListItemGroup type="with-avatar">
    {ROWS.map((r) => (
      <ListItem
        key={r}
        label="Label"
        value="Primary Value"
        avatar={<Avatar type="icon" shape="circle" />}
      />
    ))}
  </ListItemGroup>
</Container>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `compact \| normal \| with-avatar` | `compact` | Presets the rows: |
| `children` | `` | — |  |
| `className` | `` | — |  |

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
