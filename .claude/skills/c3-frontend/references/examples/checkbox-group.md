# CheckboxGroup

Vertical stack of Checkbox options. Supports flat
lists and nested trees, in 3 sizes.

## Import

```tsx
import { CheckboxGroup } from '@/components/ui/checkbox-group';
```

## Examples

### Example 1

```tsx
<CheckboxGroup {...args}>
  <Checkbox size={args.size} label="Email" />
  <Checkbox size={args.size} label="SMS" />
  <Checkbox size={args.size} label="Push" />
</CheckboxGroup>
```

### Example 2

```tsx
<div>
  {(["sm", "md", "lg"] as const).map((size) => (
    <div key={size}>
      <div>{size}</div>
      <CheckboxGroup size={size}>
        <Checkbox size={size} label="Option one" />
        <Checkbox size={size} label="Option two" defaultChecked />
        <Checkbox size={size} label="Option three" />
      </CheckboxGroup>
    </div>
  ))}
</div>
```

### Example 3

```tsx
<CheckboxGroup size="md">
  <NestedGroup parentLabel="All notifications" childLabels={["Email", "SMS", "Push"]} />
  <NestedGroup parentLabel="Marketing emails" childLabels={["Product updates", "Newsletter"]} />
</CheckboxGroup>
```

### Example 4

```tsx
<div>
  {(["sm", "md", "lg"] as const).map((size) => (
    <div key={size}>
      <div>{size}</div>
      <CheckboxGroup size={size}>
        <Checkbox size={size} label="Parent A" />
        <CheckboxGroup size={size} level="nested">
          <Checkbox size={size} label="Child A.1" />
          <Checkbox size={size} label="Child A.2" />
          <CheckboxGroup size={size} level="nested">
            <Checkbox size={size} label="Grandchild A.2.a" />
            <Checkbox size={size} label="Grandchild A.2.b" />
          </CheckboxGroup>
        </CheckboxGroup>
        <Checkbox size={size} label="Parent B" />
        <CheckboxGroup size={size} level="nested">
          <Checkbox size={size} label="Child B.1" />
          <Checkbox size={size} label="Child B.2" />
        </CheckboxGroup>
      </CheckboxGroup>
    </div>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | Controls indent + guide-line position when nested. |
| `level` | `default \| nested` | `default` | `nested` adds a left indent and a vertical guide line. |
| `children` | `` | — |  |
| `className` | `` | — |  |

## When NOT to use

- One-of-many selection → RadioGroup.
- A single isolated checkbox → Checkbox directly.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
