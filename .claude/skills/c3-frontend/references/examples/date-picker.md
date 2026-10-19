# DatePicker / DateRangePicker

A date trigger (calendar icon + value) that opens a Calendar popover. Single-date and range modes
via two exports.

## Import

```tsx
import { DatePicker, DateRangePicker } from '@/components/ui/date-picker';
```

## Examples

### Example 1

```tsx
<div>
  <DatePicker
    size={size}
    appearance={appearance}
    disabled={disabled}
    defaultValue={prefilled ? new Date(2026, 3, 16) : undefined}
  />
</div>
```

### Example 2

```tsx
<div>
  <DateRangePicker
    size={size}
    appearance={appearance}
    disabled={disabled}
    defaultValue={
      prefilled
        ? { from: new Date(2026, 3, 16), to: new Date(2026, 3, 22) }
        : undefined
    }
  />
</div>
```

### Example 3

```tsx
<div>
  <MatrixSection
    title="DatePicker — appearance × interaction state"
    openAll={openAll}
    prefilled={prefilled}
    triggerWidth="200px"
  />
  <MatrixSection
    title="DateRangePicker — appearance × interaction state"
    range
    openAll={openAll}
    prefilled={prefilled}
    triggerWidth="240px"
  />
</div>
```

## When NOT to use

- **Production / Reliability graduation** — Reliability owns the Kendo `Input/Date` family.
- Locale/i18n-aware parsing beyond `MM/DD/YYYY` rendering.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
