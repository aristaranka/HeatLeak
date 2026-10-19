# InputFrame

A label + body + helper-text wrapper for any input. Propagates color to all four label slots.

## Import

```tsx
import { InputFrame } from '@/components/ui/input-frame';
```

## Examples

### Example 1

```tsx
<InputFrame
  label={args.showLabel ? args.labelText : undefined}
  required={args.showRequired ? args.requiredText : undefined}
  helperText={args.showHelper ? args.helperTextValue : undefined}
  counter={args.showCounter ? args.counterText : undefined}
  appearance={args.appearance}
  disabled={args.disabled}
  direction={args.direction}
>
  {renderInput(args.inputType, "first", shared)}
  {args.multipleInputs &&
    renderInput(args.inputType, "second", { ...shared, placeholder: "And here" })}
</InputFrame>
```

### Example 2

```tsx
<div
>
  <div />
  {DISABLED_VARIANTS.map((d) => (
    <div
      key={d.label}
    >
      {d.label}
    </div>
  ))}
  {APPEARANCES.map((appearance) => (
    <React.Fragment key={appearance}>
      <div>
        {appearance}
      </div>
      {DISABLED_VARIANTS.map((d) => (
        <InputFrame
          key={`${appearance}-${d.label}`}
          label="Label"
          required="Required"
          helperText="Bottom Left label"
          counter="0/3"
          appearance={appearance}
          disabled={d.disabled}
        >
          <Input placeholder="Type here" appearance={appearance} disabled={d.disabled} />
        </InputFrame>
      ))}
    </React.Fragment>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `` | — | the four label slots (top-leading, top-trailing, bottom-leading, bottom-trailing). |
| `required` | `` | — | the four label slots (top-leading, top-trailing, bottom-leading, bottom-trailing). |
| `helperText` | `` | — | the four label slots (top-leading, top-trailing, bottom-leading, bottom-trailing). |
| `counter` | `ReactNode` | — | the four label slots (top-leading, top-trailing, bottom-leading, bottom-trailing). |
| `color` | `default \| success \| danger` | `default` | Recolors all label slots. |
| `disabled` | `boolean` | — | fades the whole frame. |
| `direction` | `vertical \| horizontal` | `vertical` | Stacks multiple sibling inputs in the body. |
| `children` | `ReactNode` | — | the input(s). |

## When NOT to use

- Bare inline inputs (toolbar filters, header search) where a label is noise.
- Checkbox labels — Checkbox has its own `label`/`subText`.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
