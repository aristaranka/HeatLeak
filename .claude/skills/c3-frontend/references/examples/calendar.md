# Calendar

Date-grid component built on react-day-picker. Renders inside DatePicker / DateRangePicker; rarely
used standalone.

## Import

```tsx
import { Calendar } from '@/components/ui/calendar';
```

## Examples

### Example 1

```tsx
<Calendar mode="single" selected={date} onSelect={setDate} />
```

### Example 2

```tsx
<Calendar
  mode="range"
  selected={range as never}
  onSelect={setRange as never}
  numberOfMonths={2}
  resetOnSelect
/>
```

### Example 3

```tsx
<Calendar
  mode="multiple"
  selected={dates}
  onSelect={setDates}
  numberOfMonths={2}
/>
```

### Example 4

```tsx
<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  captionLayout="dropdown"
/>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `showOutsideDays` | `false` | — |  |
| `captionLayout` | `"label"` | — |  |

## When NOT to use

- **Any code intended for production / Reliability graduation** — Reliability owns the Kendo-backed date inputs.
- As a generic date utility — the styling is bound to c3 tokens.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
