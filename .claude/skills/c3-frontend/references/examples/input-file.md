# InputFile

A two-part file picker: a left "Upload" button + right filename area, sharing one bordered frame.
Either side opens the native file picker.

## Import

```tsx
import { InputFile } from '@/components/ui/input-file';
```

## Examples

```tsx
<div>
  {(["default", "disabled"] as const).map((rowState) => (
    <section key={rowState}>
      <h3>
        {rowState}
      </h3>
      <div
      >
        <div />
        {FILL_STATES.map((f) => (
          <div
            key={f.label}
          >
            {f.label}
          </div>
        ))}

        {SIZES.map((size) => (
          <Fragment key={size}>
            <div>
              {size}
            </div>
            {FILL_STATES.map((f) => (
              <InputFile
                key={`${rowState}-${size}-${f.label}`}
                size={size}
                disabled={rowState === "disabled"}
                multiple={f.names.length > 1}
                defaultFileNames={[...f.names]}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </section>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `sm \| md \| lg` | `md` | Button padding + frame height. |
| `buttonLabel` | `string` | `"Upload"` | ; `placeholderText: string` — default `"Upload File"`. |
| `accept` | `` | — |  |
| `multiple` | `` | — |  |
| `disabled` | `` | — |  |

## When NOT to use

- Drag-and-drop dropzones (not this — a future DropZone).
- Multi-file uploads where the list of names must be visible (only the count shows above 1).

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
