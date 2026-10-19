# Badge

A small status/label widget: 4 variants × 2 sizes × 2 shapes × 7 appearances, plus optional icons,
avatar, close, and a bare-dot `indicator` mode.

## Import

```tsx
import { Badge } from '@/components/ui/badge';
```

## Examples

### Example 1

```tsx
<Badge
  {...args}
  leadingIcon={leadingIcon ? <Star /> : undefined}
  trailingIcon={trailingIcon ? <ChevronDown /> : undefined}
  avatarSrc={avatar ? "https://i.pravatar.cc/24?u=playground" : undefined}
  onClick={clickable ? () => {} : undefined}
  onDelete={closable ? () => {} : undefined}
>
  {children}
</Badge>
```

### Example 2

```tsx
<div>
  <Badge variant="soft" appearance="accent" leadingIcon={<Loader2 />}>
    Syncing…
  </Badge>
  <Badge variant="solid" appearance="primary" trailingIcon={<Loader2 />}>
    Loading
  </Badge>
  <Badge variant="outline" appearance="warning" leadingIcon={<Loader2 />}>
    Pending
  </Badge>
</div>
```

### Example 3

```tsx
<div>
  {(["solid", "soft", "outline"] as const).map((v) => (
    <Badge key={v} variant={v} appearance="accent" onClick={() => {}}>
      Clickable
    </Badge>
  ))}
</div>
```

### Example 4

```tsx
<div>
  <div>
    <div>
      Standalone (all appearances)
    </div>
    <div>
      {APPEARANCES.map((a) => (
        <div key={a}>
          <Badge variant="indicator" appearance={a} />
          <span>{a}</span>
        </div>
      ))}
    </div>
  </div>

  <div>
    <div>
      Overlaid — top-right corner of a target
    </div>
    <div>
      <span>
        <Bell />
        <Badge variant="indicator" appearance="danger" />
      </span>
      <span>
        <Bell />
        <Badge variant="indicator" appearance="success" />
      </span>
    </div>
  </div>
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `solid \| soft \| outline \| indicator` | `solid` | `indicator` renders a bare dot and ignores text/icons/avatar/size/shape. |
| `appearance` | `primary \| secondary \| accent \| success \| warning \| danger \| info` | `primary` |  |
| `size` | `sm \| md` | `md` | Padding only (sm 6/2px, md 8/6px). |
| `shape` | `pill \| rounded` | `pill` | `pill` = 9999px radius, `rounded` = 4px. |
| `leadingIcon` | `` | — | inline 12px icon slots. Pass `Loader2` for a busy badge. |
| `trailingIcon` | `ReactNode` | — | inline 12px icon slots. Pass `Loader2` for a busy badge. |
| `avatarSrc` | `string` | — | small circular leading avatar. |
| `onClick` | `() => void` | — | makes the badge interactive: `role="button"`, focusable, keyboard Enter/Space, hover overlay + focus ring. |
| `onDelete` | `() => void` | — | renders a trailing close (X) button; composes with `onClick`. |
| `asChild` | `boolean` | — | render as a different element via Slot (single child only; skips icon/avatar/close slots). |

## When to use

- Status labels in tables, cards, and list items ("Active", "Pending", "Error").
- Filter chips and removable tags (`onDelete`), optionally clickable (`onClick`).
- Unread / status dots via `variant="indicator"`, standalone or overlaid on an icon's corner.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
