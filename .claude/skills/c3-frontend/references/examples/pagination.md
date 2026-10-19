# Pagination

A presentational, controlled pager: previous / page-number / "more" / next controls, with an optional
items-per-page select and range label for table footers.

## Import

```tsx
import { Pagination } from '@/components/ui/pagination';
```

## Examples

### Example 1

```tsx
<div>
  <Pagination
    {...args}
    page={page}
    pageSize={pageSize}
    onPageChange={setPage}
    onPageSizeChange={setPageSize}
  />
</div>
```

### Example 2

```tsx
<div>
  <div>
    <div>
      controls
    </div>
    <Pagination page={p1} pageCount={5} onPageChange={setP1} />
  </div>
  <div>
    <div>
      full
    </div>
    <Pagination
      type="full"
      page={p2}
      pageCount={12}
      totalItems={140}
      pageSize={size}
      onPageChange={setP2}
      onPageSizeChange={setSize}
    />
  </div>
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | `number` | — | required; **controlled**. |
| `pageCount` | `number` | — | required; **controlled**. |
| `onPageChange(page)` | `` | — | required; **controlled**. |
| `type` | `controls \| full` | `controls` |  |
| `totalItems` | `` | `[12, 24, 48, 96]` |  |
| `pageSize` | `` | `[12, 24, 48, 96]` |  |
| `pageSizeOptions` | `` | `[12, 24, 48, 96]` |  |
| `onPageSizeChange(size)` | `` | `[12, 24, 48, 96]` |  |
| `showItemsPerPage` | `` | `[12, 24, 48, 96]` |  |
| `showRangeLabel` | `` | `[12, 24, 48, 96]` |  |
| `showMore` | `` | — | show the "more pages" affordance when the window doesn't reach `pageCount`. Default `true`. |

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
