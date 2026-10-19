# Avatar

A 32px user/entity glyph with three content types (image / initials / icon), two shapes, an optional
border ring, and a status indicator dot.

## Import

```tsx
import { Avatar } from '@/components/ui/avatar';
```

## Examples

```tsx
<div>
  {SHAPES.map((shape) =>
    [false, true].map((border) => (
      <div key={`${shape}-${border}`}>
        <div>
          {shape}{border ? " · bordered" : ""}
        </div>
        <div>
          {TYPES.map((type) => (
            <Avatar
              key={type}
              type={type}
              shape={shape}
              border={border}
              initials="C3"
              src={SAMPLE_IMG}
            />
          ))}
          <Avatar type="icon" shape={shape} border={border} indicator />
        </div>
      </div>
    )),
  )}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `image \| initials \| icon` | — | defaults to `image` when `src` is set, else `icon`. |
| `src` | `` | — | image source + alt text (for `type="image"`). |
| `alt` | `` | — | image source + alt text (for `type="image"`). |
| `initials` | `string` | — | short text (e.g. "C3") for `type="initials"`. |
| `icon` | `ReactNode` | — | custom glyph for `type="icon"` (default `User`). |
| `shape` | `rounded \| circle` | `rounded` | (8px) vs full-round. |
| `border` | `boolean` | — | adds a 1px ring. |
| `indicator` | `boolean` | — | success-green status dot at the top-right. |

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
