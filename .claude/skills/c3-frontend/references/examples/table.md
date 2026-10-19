# Table

Lightweight, presentational table for inline content — docs tables, spec sheets, comparison grids
embedded in prose. The static counterpart to DataGrid.

## Import

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
```

## Examples

### Example 1

```tsx
<div>
  <Table {...args}>
    <TableHeader>
      <TableRow>
        <TableHead>Region</TableHead>
        <TableHead>Environment</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>us-east-1</TableCell>
        <TableCell>production</TableCell>
        <TableCell>Healthy</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>us-west-2</TableCell>
        <TableCell>production</TableCell>
        <TableCell>Healthy</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>eu-central-1</TableCell>
        <TableCell>staging</TableCell>
        <TableCell>Degraded</TableCell>
      </TableRow>
    </TableBody>
    <TableCaption>Deployment status by region — refreshed hourly.</TableCaption>
  </Table>
</div>
```

### Example 2

```tsx
<div>
  <Table {...args}>
    <TableHeader>
      <TableRow>
        <TableHead>Token</TableHead>
        <TableHead>Value</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>spacing-8</TableCell>
        <TableCell>8px</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>spacing-12</TableCell>
        <TableCell>12px</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>spacing-16</TableCell>
        <TableCell>16px</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
