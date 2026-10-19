# DataGrid

A composable, presentational data table. Cell content is bring-your-own composition of existing
primitives; sort, filter, and selection render state and emit callbacks — the consumer owns the
data.

## Import

```tsx
import { DataGrid, DataGridHeader, DataGridBody, DataGridRow, DataGridHead, DataGridCell } from '@/components/ui/data-grid';
```

## Examples

### Example 1

```tsx
<div>
  <DataGridExample />
</div>
```

### Example 2

```tsx
<div>
  <Container
    contentWidth="full-width"
    title="Container Title"
    subtitle="Subtitle"
    footer={
      <Pagination type="full" page={page} pageCount={3} totalItems={35} pageSize={12} onPageChange={setPage} />
    }
  >
    <div>
      <DataGridToolbar
        search={<InputSearch placeholder="Search" />}
        tertiary={<Button>Tertiary</Button>}
        secondary={<Button>Secondary</Button>}
        primary={<Button leadingIcon={<Plus />}>Add New</Button>}
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        onDownload={handleDownload}
        menu={
          <>
            <DropdownMenuItem label="Export all" leftIcon={<Download />} onSelect={handleDownload} />
            <DropdownMenuSeparator />
            <DropdownMenuItem label="Delete selected" leftIcon={<Trash2 />} destructive />
          </>
        }
      />
      <DataGridExample visible={visible} />
    </div>
  </Container>
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `DataGridHead` | `` | `true` |  |
| `align` | `` | `true` |  |
| `left` | `` | `true` |  |
| `right` | `` | `true` |  |
| `columnBorder` | `` | `true` |  |
| `sortable` | `` | `true` |  |
| `sortDirection` | `` | `true` |  |
| `onSort` | `` | `true` |  |
| `filterable` | `` | `true` |  |
| `filterActive` | `` | `true` |  |
| `onFilter` | `` | `true` |  |
| `sortable` | `` | `true` |  |
| `filterable` | `` | `true` |  |
| `DataGridCell` | `` | — |  |
| `align` | `` | — |  |
| `left` | `` | — |  |
| `right` | `` | — |  |
| `DataGridRow` | `` | — | tints the row (also has a hover state). |
| `selected` | `boolean` | — | tints the row (also has a hover state). |
| `DataGridRowActions` | `` | `false` | (hover/selected/focus-within reveal). |
| `alwaysVisible` | `boolean` | `false` | (hover/selected/focus-within reveal). |
| `DataGridToolbar` | `` | — |  |
| `search` | `` | — |  |
| `tertiary` | `` | — |  |
| `secondary` | `` | — |  |
| `primary` | `` | — |  |
| `columns` | `` | — |  |
| `visibleColumns` | `` | — |  |
| `onVisibleColumnsChange` | `` | — |  |
| `onDownload` | `` | — |  |
| `menu` | `` | — |  |
| `menuLabel` | `` | — |  |
| `size` | `` | — |  |
| `headers` | `` | — | helper to build + trigger a CSV download. Pass the full dataset (including hidden columns). |

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
