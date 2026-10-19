# ActionGroup

The canonical, ordered action cluster — a button hierarchy (tertiary → secondary → primary), a
divider, and a trailing icon/overflow group — shared by PageHeader, DataGridToolbar, and any
container that needs standardized actions.

## Import

```tsx
import { ActionGroup } from '@/components/ui/action-group';
```

## Examples

### Example 1

```tsx
<ActionGroup
  {...args}
  tertiary={<Button>Tertiary</Button>}
  secondary={[
    <Button key="a">Secondary</Button>,
    <Button key="b">Secondary</Button>,
  ]}
  primary={<Button>Primary</Button>}
  menu={Menu}
/>
```

### Example 2

```tsx
<div>
  <Labeled label="Full hierarchy + overflow">
    <ActionGroup
      tertiary={<Button>Tertiary</Button>}
      secondary={<Button>Secondary</Button>}
      primary={<Button>Primary</Button>}
      menu={Menu}
    />
  </Labeled>

  <Labeled label="Overflow only — no divider">
    <ActionGroup menu={Menu} />
  </Labeled>

  <Labeled label="Hierarchy only — no divider">
    <ActionGroup
      secondary={<Button>Secondary</Button>}
      primary={<Button>Primary</Button>}
    />
  </Labeled>

  <Labeled label="DataGrid-style icon actions (columns / download / ellipsis)">
    <ActionGroup
      tertiary={<Button>Tertiary</Button>}
      secondary={<Button>Secondary</Button>}
      primary={<Button leadingIcon={<Plus />}>Add New</Button>}
      iconActions={
        <>
          <Button variant="ghost" appearance="secondary" size="icon-md" aria-label="Columns">
            <Columns3 />
          </Button>
          <Button variant="ghost" appearance="secondary" size="icon-md" aria-label="Download">
            <Download />
          </Button>
        </>
      }
      menu={Menu}
    />
  </Labeled>
</div>
```

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
