# SideNavPanelV2

The next-generation left navigation: a single collapsible surface that **merges** the legacy
`SideNavBar` (icon rail) and `SideNavPanel` (tree). Expanded it is a 256px labeled tree; collapsed
it is a 48px icon-only rail — the inverse of `SideNavBar`, which stays wide to fit text.

## Import

```tsx
import { SideNavPanelV2, SideNavPanelV2Section, SideNavPanelV2Group, SideNavPanelV2Item } from '@/components/ui/side-nav-panel-v2';
```

## Examples

### Example 1

```tsx
<Frame>
  <SideNavPanelV2
    {...args}
    expanded={expanded}
    onExpandedChange={setExpanded}
    value={page}
    onValueChange={setPage}
    search={<InputSearch />}
    footer={FooterTree}
  >
    {SampleTree}
  </SideNavPanelV2>
  <PageContent page={page} onNavigate={setPage} />
</Frame>
```

### Example 2

```tsx
<Frame>
  <SideNavPanelV2
    title="Side Navigation"
    subtitle="Horem ipsum dolor sit amet, consectacing elit."
    expanded={expanded}
    onExpandedChange={setExpanded}
    defaultValue="analytics"
    search={<InputSearch />}
    footer={FooterTree}
  >
    {SampleTree}
  </SideNavPanelV2>
</Frame>
```

### Example 3

```tsx
<Frame>
  <SideNavPanelV2
    title="Settings"
    showBackArrow
    expanded={expanded}
    onExpandedChange={setExpanded}
    defaultValue="general"
  >
    <SideNavPanelV2Section label="Workspace" collapsible defaultOpen>
      <SideNavPanelV2Item value="general" icon={<Settings />} label="General" />
      <SideNavPanelV2Item value="notifications" icon={<Bell />} label="Notifications" />
    </SideNavPanelV2Section>
    <SideNavPanelV2Section label="Account" infoIcon={<Info />} divider={false}>
      <SideNavPanelV2Item value="security" icon={<FileText />} label="Security" />
      <SideNavPanelV2Item value="data" icon={<Folder />} label="Data" />
    </SideNavPanelV2Section>
  </SideNavPanelV2>
</Frame>
```

## When NOT to use

- A content container (not navigation) → SidePanel.
- Selecting a value in a form/popover → Listbox / Combobox.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
