# Page Header

The full-width band at the top of a page: an optional breadcrumb trail, a title + description with
right-aligned actions, an optional content region (stats / selects / KPI cards), and an optional tab
row.

## Import

```tsx
import { PageHeader } from '@/components/ui/page-header';
```

## Examples

### Example 1

```tsx
<Demo>
  <PageHeader
    title={title}
    description={description || undefined}
    breadcrumbs={breadcrumbs ? BREADCRUMBS : undefined}
    actions={actions ? Actions : undefined}
    tabs={tabs ? TabRow : undefined}
  >
    {content ? StatRow : undefined}
  </PageHeader>
</Demo>
```

### Example 2

```tsx
<div>
  <Demo label="Default — title + actions">
    <PageHeader title="Page Title" description="Description" actions={Actions} />
  </Demo>

  <Demo label="Default — breadcrumbs + tabs">
    <PageHeader
      title="Page Title"
      description="Description"
      breadcrumbs={BREADCRUMBS}
      actions={Actions}
      tabs={TabRow}
    />
  </Demo>

  <Demo label="With content — breadcrumbs + content">
    <PageHeader
      title="Page Title"
      description="Description"
      breadcrumbs={BREADCRUMBS}
      actions={Actions}
    >
      {StatRow}
    </PageHeader>
  </Demo>

  <Demo label="With content — breadcrumbs + content + tabs">
    <PageHeader
      title="Page Title"
      description="Description"
      breadcrumbs={BREADCRUMBS}
      actions={Actions}
      tabs={TabRow}
    >
      {StatRow}
    </PageHeader>
  </Demo>
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `ReactNode` | — | page title (xl Header title, H4-bold, truncates). |
| `description` | `ReactNode` | — | beneath the title (P2; maps to Header `subtitle`). |
| `breadcrumbs` | `BreadcrumbItemData[]` | — | rendered via Breadcrumbs; hidden when empty. |
| `actions` | `ReactNode` | — | right-aligned, top-aligned to the title block (pass an `ActionGroup`). |
| `tabs` | `ReactNode` | — | the tab-row slot (pass a `Tabs`); the panels live in the page body below. |
| `children` | `ReactNode` | — | the optional content region (the "With Content" type). |

## When NOT to use

- The app chrome bar → TopNavBar.
- A card / modal / form header → Header directly.
- A bare mid-page tab strip → Tabs.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
