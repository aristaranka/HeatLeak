# SidePanel

A side-pinned container panel — header (title / subtitle / close) + flexible content + optional
footer button stack. Presentational: the styled shell, not a dialog with its own open/close
machinery.

## Import

```tsx
import { SidePanel } from '@/components/ui/side-panel';
```

## Examples

### Example 1

```tsx
<PageShell>
  <SidePanel {...args}>{SampleContent}</SidePanel>
</PageShell>
```

### Example 2

```tsx
<div>
  {BEHAVIORS.map((behavior) =>
    CONTENT_WIDTHS.map((contentWidth) => (
      <div key={`${behavior}-${contentWidth}`}>
        <div>
          {behavior} · {contentWidth}
        </div>
        <SidePanel
          behavior={behavior}
          contentWidth={contentWidth}
          title="Side Panel Title"
          subtitle="Subtitle"
          footer={FooterButtons}
        >
          {SampleContent}
        </SidePanel>
      </div>
    )),
  )}
</div>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `behavior` | `push \| overlay` | `push` | `push` is flush (no shadow, shifts page content); `overlay` floats above with an elevation shadow. |
| `contentWidth` | `contained \| full` | `contained` | `full` runs the body edge-to-edge (header/footer stay inset) for full-bleed content. |
| `title` | `ReactNode` | — |  |
| `subtitle` | `ReactNode` | — |  |
| `onClose` | `() => void` | — | fired by the header close button; `hideClose: boolean` drops it. |
| `footer` | `ReactNode` | — | optional button stack. |

## When NOT to use

- Centered, focus-trapped, blocking dialogs → Modal.
- App navigation chrome → SideNavPanel / SideNavBar.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
