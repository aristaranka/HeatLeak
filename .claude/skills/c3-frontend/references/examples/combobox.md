# Combobox

Single-select typeahead. Looks like Input; the user types to filter the option list. Composes
`Input` + `Listbox` inside a `Popover`.

## Import

```tsx
import { Combobox } from '@/components/ui/combobox';
```

## Examples

### Example 1

```tsx
<div>
  <Combobox {...args} />
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
              <Combobox
                key={`${size}-${appearance}-${s.label}`}
                size={size}
                appearance={appearance}
                disabled={s.disabled}
                leftIcon={withLeadingIcon ? <User /> : undefined}
                placeholder="Select item"
                options={FRUITS}
                defaultValue={filled ? "apple" : undefined}
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
  <Combobox
    size="md"
    placeholder="Select country"
    options={COUNTRIES}
  />
</div>
```

### Example 4

```tsx
<div>
  <Combobox
    size="md"
    placeholder="Select country"
    options={COUNTRIES.slice(0, 6)}
    defaultValue="ca"
  />
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | Matches Input. |
| `appearance` | `default \| success \| danger` | `default` | Matches Input. |
| `options` | `{ value, label, subLabel?, disabled? }[]` | — | the option list. |
| `value` | `` | — | selected value (controlled / uncontrolled). |
| `defaultValue` | `string \| null` | — | selected value (controlled / uncontrolled). |
| `onValueChange` | `(value: string \| null) => void` | — | called on commit (including clear). |
| `placeholder` | `string` | `"Select item"` |  |
| `leftIcon` | `ReactNode` | — | optional leading icon. |
| `filter` | `(option, query) => boolean` | — | defaults to case-insensitive substring on label + value. |
| `emptyMessage` | `ReactNode` | — | shown when the filter returns nothing. Default `"No results"`. |
| `disabled` | `` | — | standard. |

## When NOT to use

- Action menus (`role="menu"`) — build a Popover + Listbox.
- Async / server-side lists — no async support yet.
- Multi-select — a future MultiSelect wraps Combobox + `Listbox`.
- Boolean / two-state → Switch.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
