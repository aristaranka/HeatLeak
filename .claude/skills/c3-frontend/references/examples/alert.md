# Alert

Banner-style notification with a leading icon or avatar, title + description, and optional trailing
action button + close. Three visual variants × five appearances.

## Import

```tsx
import { Alert, AlertAppearanceIcon, AlertContent, AlertTitle, AlertDescription, AlertAction, AlertClose } from '@/components/ui/alert';
```

## Examples

### Example 1

```tsx
<Alert variant={variant} appearance={appearance}>
  <AlertAppearanceIcon appearance={appearance} />
  <AlertContent>
    <AlertTitle>{title}</AlertTitle>
    {description ? <AlertDescription>{description}</AlertDescription> : null}
  </AlertContent>
  {showClose && <AlertClose />}
  {showAction && <AlertAction>Button</AlertAction>}
</Alert>
```

### Example 2

```tsx
<div>
  {VARIANTS.map((v) => (
    <div key={v}>
      <div>{v}</div>
      {APPEARANCES.map((t) => (
        <Alert key={t} variant={v} appearance={t}>
          <AlertAppearanceIcon appearance={t} />
          <AlertContent>
            <AlertTitle>New message!</AlertTitle>
            <AlertDescription>12 unread messages. Tap to see.</AlertDescription>
          </AlertContent>
          <AlertClose />
          <AlertAction>Button</AlertAction>
        </Alert>
      ))}
    </div>
  ))}
</div>
```

### Example 3

```tsx
<Alert variant="soft" appearance="info">
  <AlertAppearanceIcon appearance="info" />
  <AlertContent>
    <AlertTitle>Heads up.</AlertTitle>
  </AlertContent>
</Alert>
```

### Example 4

```tsx
<Alert variant="ghost" appearance="default">
  <AlertAvatar>
    <User />
  </AlertAvatar>
  <AlertContent>
    <AlertTitle>Margaret commented</AlertTitle>
    <AlertDescription>"Looks good — ship it."</AlertDescription>
  </AlertContent>
  <AlertAction>View</AlertAction>
</Alert>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `solid \| soft \| ghost` | `solid` | The surface treatment. |
| `appearance` | `default \| info \| success \| warning \| destructive` | `default` | Semantic swatch. |

## When to use

- Inline status / system messages that shouldn't block the user (use Dialog/Modal for blocking).
- Confirmation banners after a save / publish / error.
- Per-section information messages ("This experiment is paused.").

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
