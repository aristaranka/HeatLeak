# Button

Primary action element with 4 variants × 5 colors × 3 sizes, plus icon-only sizes. The most-used
primitive in the library.

## Import

```tsx
import { Button } from '@/components/ui/button';
```

## Examples

### Example 1

```tsx
<div>
  <Button variant="solid">Solid</Button>
  <Button variant="soft">Soft</Button>
  <Button variant="outline">Outline</Button>
  <Button variant="ghost">Ghost</Button>
  <Button variant="solid" appearance="danger">Danger</Button>
</div>
```

### Example 2

```tsx
<Button
  variant={variant}
  appearance={appearance}
  size={size}
  disabled={state === "Disabled"}
  leadingIcon={Leading ? <Leading /> : undefined}
  trailingIcon={Trailing ? <Trailing /> : undefined}
>
  {children}
</Button>
```

### Example 3

```tsx
<div>
  {VARIANTS.map((v) => (
    <section key={v}>
      <h3>
        {v} Button
      </h3>
      <div>
        <div>
          {STATES.map((state) => (
            <div key={state.label}>
              <div>
                {state.label}
              </div>
              <div>
                {TONES.map((t) => (
                  <div key={t}>
                    {SIZES.map((s) => (
                      <Button
                        key={`${v}-${t}-${s}-${state.label}`}
                        variant={v}
                        appearance={t}
                        size={s}
                        disabled={state.disabled}
                      >
                        Button
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  ))}
</div>
```

### Example 4

```tsx
<div>
  {SIZES.map((s) => (
    <div key={s}>
      <div>
        {s}
      </div>
      <Button size={s} leadingIcon={<Plus />}>
        Leading
      </Button>
      <Button size={s} trailingIcon={<ChevronDown />}>
        Trailing
      </Button>
      <Button size={s} leadingIcon={<Plus />} trailingIcon={<ChevronDown />}>
        Both
      </Button>
    </div>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `solid \| soft \| outline \| ghost` | `solid` | The visual style. |
| `appearance` | `accent \| secondary \| success \| danger \| warning` | `accent` | The semantic appearance. |
| `size` | `sm \| md \| lg \| icon-sm \| icon-md \| icon-lg` | `md` | Icon sizes are square. |
| `asChild` | `boolean` | `false` | Renders as the consumer's element via the Radix `Slot` (e.g. to wrap a router `Link`). Disables `leadingIcon`/`trailingIcon` — `Slot` requires a single child. |
| `loading` | `boolean` | `false` | Swaps the leading icon for a spinner, sets `aria-busy`, and blocks interaction. Rendered at full opacity (busy, not disabled) — see the **Loading** story below. |
| `leadingIcon` | `` | — | inline 16px (sm: 14px) icon slots. Lucide icons only. |
| `trailingIcon` | `ReactNode` | — | inline 16px (sm: 14px) icon slots. Lucide icons only. |
| `disabled` | `` | — | standard. Also respected as `aria-disabled` on non-button elements via `asChild`. |

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
