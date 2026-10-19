# Input

Single-line text input with a bordered wrapper, optional leading/trailing icon slots, and three
validation appearances.

## Import

```tsx
import { Input } from '@/components/ui/input';
```

## Examples

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
        {APPEARANCES.map((t) => (
          <React.Fragment key={t}>
            <div>
              {t}
            </div>
            {STATES.map((s) => (
              <Input
                key={`${size}-${t}-${s.label}`}
                size={size}
                appearance={t}
                disabled={s.disabled}
                defaultValue="This is my text"
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | Heights 28 / 32 / 36 px. |
| `appearance` | `default \| success \| danger` | `default` | Drives the border color (the focus ring is always accent). |
| `leftIcon` | `` | — | optional 16px inline icon slots (lucide-react). |
| `rightIcon` | `ReactNode` | — | optional 16px inline icon slots (lucide-react). |
| `disabled` | `` | — | fades the whole wrapper. |
| `placeholder` | `` | — |  |
| `value` | `` | — |  |
| `onChange` | `` | — |  |

## When NOT to use

- Multi-line → Textarea.
- Numbers with steppers → InputNumber.
- Search with a clear button → InputSearch.
- File upload → InputFile.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
