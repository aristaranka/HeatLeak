# Listbox

A bare list-of-selectable-items surface (`ul`). Owns selection + active-row state
and keyboard nav; owns no positioning or popover chrome — the consumer wraps it with a Popover.
Composable with `ListboxItem` / `ListboxHeader` / `ListboxSeparator`.

## Import

```tsx
import { Listbox, ListboxItem, ListboxHeader, ListboxSeparator } from '@/components/ui/listbox';
```

## Examples

### Example 1

```tsx
<div
>
  <Listbox mode={args.mode} autoFocusable={args.autoFocusable} defaultValue="apple" defaultValues={["apple"]}>
    {args.showHeader && <ListboxHeader>Fruits</ListboxHeader>}
    {FRUITS.slice(0, 3).map((o, i) => (
      <ListboxItem
        key={o.value}
        value={o.value}
        label={o.label}
        subLabel={args.showSubLabels ? o.sub : undefined}
        leftIcon={allowLeftIcons ? <Tag /> : undefined}
        disabled={args.disableOneItem && i === 1}
      />
    ))}
    {args.showSeparator && <ListboxSeparator />}
    {FRUITS.slice(3).map((o) => (
      <ListboxItem
        key={o.value}
        value={o.value}
        label={o.label}
        subLabel={args.showSubLabels ? o.sub : undefined}
        leftIcon={allowLeftIcons ? <Tag /> : undefined}
      />
    ))}
  </Listbox>
</div>
```

### Example 2

```tsx
<div>
  {MODES.map((mode) => (
    <section key={mode}>
      <div>
        mode: {mode}
      </div>
      <div
      >
        {STATE_VARIANTS.map((s) => (
          <div
            key={s.key}
          >
            {s.label}
          </div>
        ))}
        {STATE_VARIANTS.map((s) => (
          <div
            key={`${mode}-${s.key}`}
          >
            <Listbox
              mode={mode}
              defaultValue={s.key === "selected" ? "apple" : null}
              defaultValues={s.key === "selected" ? ["apple"] : []}
              autoFocusable={false}
            >
              <ListboxItem
                value="apple"
                label="Apple"
                leftIcon={mode === "single" ? <User /> : undefined}
                disabled={s.key === "disabled"}
                {...(s.attrs as React.HTMLAttributes<HTMLLIElement>)}
              />
            </Listbox>
          </div>
        ))}
      </div>
    </section>
  ))}
</div>
```

## When NOT to use

- An inline trigger that opens a list → Combobox.
- A form radio group → RadioGroup.
- Form checkbox multi-select (not in an overlay) → CheckboxGroup.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
