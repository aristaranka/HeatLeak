# Textarea

A multi-line text input — the same appearance model as Input, but with regular-weight text and
vertical-only resize.

## Import

```tsx
import { Textarea } from '@/components/ui/textarea';
```

## Examples

```tsx
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
  {APPEARANCES.map((t) => (
    <React.Fragment key={t}>
      <div>
        {t}
      </div>
      {STATES.map((s) => (
        <Textarea
          key={`${t}-${s.label}`}
          appearance={t}
          disabled={s.disabled}
          defaultValue="This is my text"
          rows={3}
        />
      ))}
    </React.Fragment>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `appearance` | `default \| success \| danger` | `default` | Drives the border (focus ring is always accent). |
| `rows` | `` | — |  |
| `value` | `` | — |  |
| `onChange` | `` | — |  |
| `placeholder` | `` | — |  |
| `size` | `` | — | Figma defines a single padding scheme. |

## When NOT to use

- Single line → Input.
- Code editors (would need monospace + line numbers).

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
