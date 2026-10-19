# MultiSelect

Multi-select typeahead. Looks like Input; the user types to filter, and each committed value becomes
a removable chip in the field. Composes a trigger frame + `Badge` chips + `Listbox`
inside a `Popover`.

## Import

```tsx
import { MultiSelect } from '@/components/ui/multi-select';
```

## Examples

### Example 1

```tsx
<div>
  <MultiSelect {...args} />
</div>
```

### Example 2

```tsx
<div>
  {SIZES.map((size) => (
    <section key={size}>
      <div style={headerStyle}>Size: {size}</div>
      <div
      >
        <div />
        {STATES.map((s) => (
          <div key={s.label} style={headerStyle}>
            {s.label}
          </div>
        ))}
        {APPEARANCES.map((appearance) => (
          <React.Fragment key={appearance}>
            <div capitalize`} style={headerStyle}>
              {appearance}
            </div>
            {STATES.map((s) => (
              <MultiSelect
                key={`${size}-${appearance}-${s.label}`}
                size={size}
                appearance={appearance}
                disabled={s.disabled}
                placeholder="Select item"
                options={FRUITS}
                defaultValues={filled ? ["apple", "banana"] : undefined}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </section>
  ))}
</div>
```

### Example 3

```tsx
<div>
  <div style={headerStyle}>type to filter</div>
  <MultiSelect
    size="md"
    placeholder="Select countries"
    options={COUNTRIES}
  />
</div>
```

### Example 4

```tsx
<div>
  <MultiSelect
    size="md"
    placeholder="Select countries"
    options={COUNTRIES.slice(0, 6)}
    defaultValues={["ca", "mx"]}
  />
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | (matches Input). |
| `appearance` | `default \| success \| danger` | `default` | (matches Input). |
| `options` | `{ value, label, subLabel?, disabled? }[]` | — | the option list (shared `ComboboxOption` shape). |
| `values` | `` | — | selected values (controlled / uncontrolled). |
| `defaultValues` | `string[]` | — | selected values (controlled / uncontrolled). |
| `onValuesChange` | `(values: string[]) => void` | — | fires on every add/remove (chip X, option toggle, Backspace). |
| `placeholder` | `string` | `"Select item"` | (shown only when empty). |
| `filter` | `` | — | as in Combobox. |
| `emptyMessage` | `` | — | as in Combobox. |
| `disabled` | `` | — | as in Combobox. |

## When NOT to use

- Single-select → Combobox.
- Action menus (`role="menu"`) → build a Popover + Listbox.
- Async / server-side lists — feed pre-filtered `options`.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
