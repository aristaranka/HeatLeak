# SideNavPanel

A vertical navigation *tree* panel — header + collapsible folder groups + nested selectable leaf
items + footer. Expands to 256px or collapses to a 36px rail. The label-rich counterpart to the
icon-only SideNavBar.

## Import

```tsx
import { SideNavPanel, SideNavPanelSection, SideNavPanelGroup, SideNavPanelItem } from '@/components/ui/side-nav-panel';
```

## Examples

### Example 1

```tsx
<Frame>
  <SideNavPanel
    {...args}
    expanded={expanded}
    onExpandedChange={setExpanded}
    defaultValue="b"
    footer={FooterButtons}
  >
    {SampleTree}
  </SideNavPanel>
</Frame>
```

### Example 2

```tsx
<Frame>
  <SideNavPanel
    title="Title"
    subtitle="Horem ipsum dolor sit amet, consectacing elit."
    expanded={expanded}
    onExpandedChange={setExpanded}
    defaultValue="b"
    footer={FooterButtons}
  >
    {SampleTree}
  </SideNavPanel>
</Frame>
```

## When NOT to use

- Compact icon-only rails → SideNavBar.
- Selecting a value in a form/popover → Listbox / Combobox.
- A content container (not navigation) → SidePanel.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
