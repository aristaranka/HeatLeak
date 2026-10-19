# DropdownMenu

An external trigger plus a popout that looks like a Listbox but carries menu semantics
(`role="menu"`). Items perform actions — they don't persist a value.

## Import

```tsx
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
```

## Examples

```tsx
<div>
  <DropdownMenu align={align} side={side}>
    <DropdownMenuTrigger>
      <Button
        variant={triggerVariant}
        appearance={triggerAppearance}
        size={triggerSize}
        trailingIcon={<ChevronDown />}
      >
        {triggerLabel}
      </Button>
    </DropdownMenuTrigger>
    {withLabel && <DropdownMenuLabel>Manage</DropdownMenuLabel>}
    {actions.map((action, i) => {
      const Icon = action.icon
      return (
        <DropdownMenuItem
          key={action.label}
          label={action.label}
          subLabel={withSubLabels ? action.subLabel : undefined}
          leftIcon={withLeftIcons ? <Icon /> : undefined}
          disabled={disabledItem && i === 1}
          onSelect={fn()}
        />
      )
    })}
    {destructiveItem && withSeparator && <DropdownMenuSeparator />}
    {destructiveItem && (
      <DropdownMenuItem
        label="Delete"
        leftIcon={withLeftIcons ? <Trash /> : undefined}
        destructive
        onSelect={fn()}
      />
    )}
  </DropdownMenu>
</div>
```

## When NOT to use

- Picking / persisting a value → Combobox.
- A bare list without a trigger → Listbox.
- A confirmation / multi-field flow → Modal.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
