# Container

A bordered card surface that wraps a header (title / subtitle / actions), a body, and an optional
footer — the shell around tables, lists, and forms.

## Import

```tsx
import { Container } from '@/components/ui/container';
```

## Examples

### Example 1

```tsx
<div>
  <Container
    size={size}
    contentWidth={contentWidth}
    title={title || undefined}
    subtitle={subtitle || undefined}
    actions={actions ? HeaderActions : undefined}
    footer={footer ? FooterActions : undefined}
  >
    <div>
      Body content goes here.
    </div>
  </Container>
</div>
```

### Example 2

```tsx
<div>
  {SIZES.map((size) => (
    <Container key={size} size={size} title="Container Title" subtitle="Subtitle" actions={HeaderActions}>
      <div>
        {size} — body content
      </div>
    </Container>
  ))}
</div>
```

### Example 3

```tsx
<div>
  <Container
    size="md"
    contentWidth="full-width"
    title="Container Title"
    subtitle="Subtitle"
    actions={HeaderActions}
    footer={
      <Pagination
        type="full"
        page={page}
        pageCount={12}
        totalItems={140}
        pageSize={12}
        onPageChange={setPage}
      />
    }
  >
    <div>
      {["Alpha", "Bravo", "Charlie"].map((r) => (
        <div
          key={r}
        >
          {r}
        </div>
      ))}
    </div>
  </Container>
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `xs \| sm \| md` | `md` | Card padding + header typography (md→H5, sm→H6, xs→L3 title). |
| `contentWidth` | `contained \| full-width` | `contained` | See Overview for the padding/border behavior of each. |
| `title` | `` | — | header slots (rendered via `Header` when at least one is set; `actions` is a ghost-icon Button group). |
| `subtitle` | `` | — | header slots (rendered via `Header` when at least one is set; `actions` is a ghost-icon Button group). |
| `actions` | `` | — | header slots (rendered via `Header` when at least one is set; `actions` is a ghost-icon Button group). |
| `footer` | `` | — | footer slot (e.g. a Button action group, or a `full` Pagination). |
| `children` | `` | — | the body. |

## When NOT to use

- A page-top band with breadcrumbs/title/tabs → PageHeader.
- A modal surface → Modal.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
