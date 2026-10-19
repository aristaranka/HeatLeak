# InputSearch

A specialization of Input with a baked-in left search icon and an optional clear (X) button that
appears once the field has a value.

## Import

```tsx
import { InputSearch } from '@/components/ui/input-search';
```

## Examples

### Example 1

```tsx
<InputSearch
  key={`${defaultValue}-${interactiveState}`}
  size={size}
  appearance={appearance}
  disabled={isDisabled}
  placeholder={placeholder}
  defaultValue={defaultValue}
/>
```

### Example 2

```tsx
<div>
  {(["sm", "md", "lg"] as const).map((size) => (
    <div key={size}>
      <div>
        Size: {size}
      </div>
      <div
      >
        <div />
        {STATES.map((s) => (
          <div
            key={s.label}
          >
            {s.label}
          </div>
        ))}
        {APPEARANCES.map((v) =>
          TEXT_ROWS.map((row) => (
            <React.Fragment key={`${v}-${row.label}`}>
              <div>
                {v} ({row.label})
              </div>
              {STATES.map((s) => (
                <InputSearch
                  key={`${size}-${v}-${row.label}-${s.label}`}
                  size={size}
                  appearance={v}
                  disabled={s.disabled}
                  placeholder="Search"
                  defaultValue={row.defaultValue}
                />
              ))}
            </React.Fragment>
          )),
        )}
      </div>
    </div>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `showClear` | `boolean` | `true` | Toggles the clear button entirely. |
| `onClear` | `() => void` | — | fires when the clear button is clicked. |
| `placeholder` | `` | — | defaults to `"Search"`. |

## When NOT to use

- Generic text input → Input.
- Search that opens a suggestion popover → needs Combobox semantics this doesn't provide.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
