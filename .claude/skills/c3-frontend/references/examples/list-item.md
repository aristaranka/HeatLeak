# ListItem

One row of a key/value list — an inline label + value, or a stacked layout with an optional
avatar/icon and a right action.

## Import

```tsx
import { ListItem } from '@/components/ui/list-item';
```

## Examples

### Example 1

```tsx
<Container>
  <ListItem
    layout={layout}
    emphasis={emphasis}
    label={label}
    value={valueAsBadge ? <Badge variant="soft" appearance="secondary">{value}</Badge> : value}
    secondaryValue={secondaryValue || undefined}
    avatar={avatar ? <Avatar type="icon" shape="circle" /> : undefined}
    labelIcon={labelIcon ? <Circle /> : undefined}
    rightAction={
      rightAction ? (
        <Button variant="ghost" appearance="secondary" size="icon-sm" aria-label="More">
          <MoreHorizontal />
        </Button>
      ) : undefined
    }
    hasBorder={hasBorder}
  />
</Container>
```

### Example 2

```tsx
<div>
  {LAYOUTS.map((layout) => (
    <div key={layout}>
      <div>
        {layout}
      </div>
      <Container>
        {EMPHASES.map((emphasis) => (
          <ListItem
            key={`${emphasis}-text`}
            layout={layout}
            emphasis={emphasis}
            label="Label"
            value="Primary Value"
            hasBorder
          />
        ))}
        {(["value", "label"] as ListItemEmphasis[]).map((emphasis) => (
          <ListItem
            key={`${emphasis}-badge`}
            layout={layout}
            emphasis={emphasis}
            label="Label"
            value={<Badge variant="soft" appearance="secondary">Primary Value</Badge>}
            hasBorder
          />
        ))}
      </Container>
    </div>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `ReactNode` | — |  |
| `value` | `` | — |  |
| `secondaryValue` | `ReactNode` | — |  |
| `layout` | `inline \| stacked` | `inline` | (or the group's default). |
| `emphasis` | `value \| label \| none` | — | which line is primary (L2/fg-primary) vs muted (P3/fg-secondary). Default `value`. |
| `labelIcon` | `` | — | **stacked-only** slots. |
| `avatar` | `` | — | **stacked-only** slots. |
| `rightAction` | `ReactNode` | — | **stacked-only** slots. |
| `hasBorder` | `boolean` | — | bottom divider (usually set by the group). |

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
