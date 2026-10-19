# TimePicker

A single-line typed time field — a Clock icon + an editable `hh:mm:ss A` string, validated on blur.
Composes `Input` directly.

## Import

```tsx
import { TimePicker } from '@/components/ui/time-picker';
```

## Examples

### Example 1

```tsx
<div>
  {SIZES.map((size) => (
    <section key={size}>
      <h3>
        {size}
      </h3>
      <div>
        <div>
          {/* column headers = appearances */}
          <div>
            <div />
            <div>
              {APPEARANCES.map((a) => (
                <div
                  key={a}
                >
                  {a}
                </div>
              ))}
            </div>
          </div>
          {/* rows = interaction states */}
          {STATES.map((state) => (
            <div key={state.label}>
              <div>
                {state.label}
              </div>
              <div>
                {APPEARANCES.map((a) => (
                  <div key={a}>
                    <TimePicker
                      size={size}
                      appearance={a}
                      disabled={state.disabled}
                      defaultValue="10:30:00 AM"
                    />
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

### Example 2

```tsx
<div>
  <TimePicker defaultValue="10:30:00 AM" onChange={setVal} />
  <div>
    onChange value: {val === null ? "null" : `"${val}"`}
  </div>
  <div>
    Try: <code>10:30 pm</code>, <code>22:30</code>, then <code>abc</code> / <code>99:99</code>
  </div>
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | (passed to Input). |
| `appearance` | `default \| success \| danger` | `default` | ; forced to `danger` while the field holds invalid input. |

## When NOT to use

- **Any production / Reliability-graduation code** — use the Kendo equivalent.
- Time *ranges*, or picking from a fixed list (no popover/dropdown by design).
- A calendar date → DatePicker.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
