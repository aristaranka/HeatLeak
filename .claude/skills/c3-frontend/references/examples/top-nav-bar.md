# TopNavBar

The application chrome bar at the top of every screen — a 48px-tall, full-width bar with a logo + app
name on the left, an optional search/tabs slot in the center, and a right-aligned action group.

## Import

```tsx
import { TopNavBar } from '@/components/ui/top-nav-bar';
```

## Examples

### Example 1

```tsx
<TopNavBar
  logo={Logo}
  appName={appName}
  center={center === "search" ? SearchSlot : center === "tabs" ? TabsSlot : undefined}
  actions={Actions}
/>
```

### Example 2

```tsx
<div>
  {[
    { label: "Default", center: undefined },
    { label: "With Search", center: SearchSlot },
    { label: "With Tabs", center: TabsSlot },
  ].map(({ label, center }) => (
    <section key={label}>
      <h3>
        {label}
      </h3>
      <div>
        <TopNavBar logo={Logo} appName="Application Name" center={center} actions={Actions} />
      </div>
    </section>
  ))}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `logo` | `ReactNode` | — | brand mark (20px icon slot). |
| `appName` | `ReactNode` | — | application name (`text-c3-bold-heading-h6`). |
| `center` | `ReactNode` | — | optional middle slot (pass InputSearch or Tabs); not rendered when absent. |
| `actions` | `ReactNode` | — | right-aligned group (ghost icon Buttons, avatar last). Extends `header` props. |

## When NOT to use

- An in-page tab strip → Tabs.
- A page/section title → PageHeader / Header.
- A standalone search field → InputSearch.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
