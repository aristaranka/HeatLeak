# SideNavBar

The vertical application rail — a 64px-wide column with a 1px right rule that stacks icon+label nav
items, with a top primary section and a pinned bottom footer.

## Import

```tsx
import { SideNavBar, SideNavBarItem } from '@/components/ui/side-nav-bar';
```

## Examples

```tsx
<div>
  <SideNavBar
    showLabels={showLabels}
    defaultValue="overview"
    footer={
      <SideNavBarItem value="settings" icon={<Settings />} label="Settings" />
    }
  >
    <SideNavBarItem value="overview" icon={<LayoutGrid />} label="Overview" />
    <SideNavBarItem value="assets" icon={<Factory />} label="Assets" />
    <SideNavBarItem value="sensors" icon={<CircleGauge />} label="Sensors" />
    <SideNavBarItem value="cases" icon={<BriefcaseBusiness />} label="Cases" />
    <SideNavBarItem value="work-orders" icon={<ListChecks />} label="Work Orders" />
    <SideNavBarItem value="analysis" icon={<ChartNoAxesCombined />} label="Analysis" />
  </SideNavBar>
</div>
```

## When NOT to use

- Top app chrome → TopNavBar. In-page tabs → Tabs. Content-dense labeled nav → SideNavPanel.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
