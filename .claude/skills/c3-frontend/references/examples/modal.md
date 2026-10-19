# Modal

Blocking overlay for confirmations and short-form workflows. Composed from a header (title +
subtitle + close), a body, and a footer with an optional left-pinned tertiary action and a
right-aligned primary + secondary action group.

## Import

```tsx
import { Modal, ModalHeader, ModalFooter, ModalFooterTertiary, ModalFooterActions } from '@/components/ui/modal';
```

## Examples

### Example 1

```tsx
<Modal defaultOpen>
  <ModalTrigger asChild>
    <Button>Open</Button>
  </ModalTrigger>
  <ModalContent contentWidth="contained" footerMode="default">
    <ModalHeader>
      <ModalTitle>Modal Title</ModalTitle>
      <ModalSubtitle>Subtitle</ModalSubtitle>
    </ModalHeader>
    <ModalBody><Body /></ModalBody>
    <ModalFooter><Footer /></ModalFooter>
  </ModalContent>
</Modal>
```

### Example 2

```tsx
<Modal defaultOpen>
  <ModalTrigger asChild>
    <Button>Open</Button>
  </ModalTrigger>
  <ModalContent contentWidth="full" footerMode="default">
    <ModalHeader>
      <ModalTitle>Modal Title</ModalTitle>
      <ModalSubtitle>Subtitle</ModalSubtitle>
    </ModalHeader>
    <ModalBody><Body /></ModalBody>
    <ModalFooter><Footer /></ModalFooter>
  </ModalContent>
</Modal>
```

### Example 3

```tsx
<Modal defaultOpen>
  <ModalTrigger asChild>
    <Button>Open</Button>
  </ModalTrigger>
  <ModalContent contentWidth="contained" footerMode="fixed">
    <ModalHeader>
      <ModalTitle>Modal Title</ModalTitle>
      <ModalSubtitle>Subtitle</ModalSubtitle>
    </ModalHeader>
    <ModalBody><Body /></ModalBody>
    <ModalFooter><Footer /></ModalFooter>
  </ModalContent>
</Modal>
```

### Example 4

```tsx
<Modal defaultOpen>
  <ModalTrigger asChild>
    <Button>Open</Button>
  </ModalTrigger>
  <ModalContent contentWidth="full" footerMode="fixed">
    <ModalHeader>
      <ModalTitle>Modal Title</ModalTitle>
      <ModalSubtitle>Subtitle</ModalSubtitle>
    </ModalHeader>
    <ModalBody><Body /></ModalBody>
    <ModalFooter><Footer /></ModalFooter>
  </ModalContent>
</Modal>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `ModalContent` | `` | `500` |  |
| `contentWidth` | `` | `500` |  |
| `contained` | `` | `500` |  |
| `full` | `` | `500` |  |
| `contained` | `` | `500` |  |
| `footerMode` | `` | `500` |  |
| `default` | `` | `500` |  |
| `fixed` | `` | `500` |  |
| `default` | `` | `500` |  |
| `width` | `` | `500` |  |
| `ModalHeader` | `` | `false` | Hides the top-right close (X) button. |
| `hideClose` | `boolean` | `false` | Hides the top-right close (X) button. |
| `ModalFooterTertiary` | `` | — | layout wrappers only, no props of their own. |
| `ModalFooterActions` | `` | — | layout wrappers only, no props of their own. |

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
