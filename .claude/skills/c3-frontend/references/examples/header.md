# Header

A full-width header band for containers — cards, sections, forms, and pages. Title + optional
subtitle, with slot-in decoration (icon/avatar), badges, an info icon, and a right-aligned action
group.

## Import

```tsx
import { Header } from '@/components/ui/header';
```

## Examples

### Example 1

```tsx
<Container>
  <Header
    size={size}
    title={title}
    subtitle={subtitle || undefined}
    leadingIcon={leadingIcon ? <TrendingUp /> : undefined}
    avatarSrc={avatar ? AVATAR : undefined}
    badges={badges ? SampleBadge : undefined}
    infoIcon={infoIcon ? <Info /> : undefined}
    actions={actions ? SampleActions : undefined}
  />
</Container>
```

### Example 2

```tsx
<div>
  {SIZES.map((size) => (
    <div key={size}>
      <div>
        {size} — {SIZE_USE_CASE[size]}
      </div>
      <Container>
        <Header
          size={size}
          title="Container Title"
          subtitle="Subtitle"
          actions={SampleActions}
        />
      </Container>
    </div>
  ))}
</div>
```

### Example 3

```tsx
<div>
  <Container>
    <Header title="Title" subtitle="Subtitle" leadingIcon={<TrendingUp />} actions={SampleActions} />
  </Container>
  <Container>
    <Header title="Title" subtitle="Subtitle" avatarSrc={AVATAR} actions={SampleActions} />
  </Container>
  <Container>
    <Header
      title="Title"
      subtitle="Subtitle"
      badges={SampleBadge}
      infoIcon={<Info />}
      actions={SampleActions}
    />
  </Container>
  <Container>
    <Header
      title="Everything, everywhere"
      subtitle="Leading icon + badges + info + actions"
      leadingIcon={<TrendingUp />}
      badges={SampleBadge}
      infoIcon={<Info />}
      actions={
        <>
          <Button variant="ghost" appearance="secondary" size="icon-sm" aria-label="Edit">
            <Pencil />
          </Button>
          {SampleActions}
        </>
      }
    />
  </Container>
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `xs \| sm \| md \| lg \| xl` | `md` | Maps to container kind (xs child card → xl page); drives title typography (L3 → H6 → H5 → H4 → H4-bold) and subtitle (P3 on xs/sm, P2 otherwise). |
| `title` | `ReactNode` | — |  |
| `subtitle` | `ReactNode` | — |  |
| `leadingIcon` | `ReactNode` | — | far-left adornment. |
| `avatarSrc` | `string` | — | far-left adornment. |
| `badges` | `ReactNode` | — | inline after the title (pass `Badge`s). |
| `infoIcon` | `ReactNode` | — | 16px slot after the badges (wrap in a Tooltip for a hint). |
| `actions` | `ReactNode` | — | right-aligned group (ghost icon `Button`s). |

## When NOT to use

- The app chrome bar → TopNavBar.
- A modal's own header row (title + close) → Modal owns that.
- A standalone status pill → Badge.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
