# Tooltip

A dark bubble overlay anchored to a trigger, with an optional caret arrow on any side and optional
icon / avatar / subtitle slots.

## Import

```tsx
import { Tooltip, TooltipTrigger, TooltipContent, TooltipText, TooltipTitle } from '@/components/ui/tooltip';
```

## Examples

### Example 1

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="outline" appearance="secondary">
      Hover me
    </Button>
  </TooltipTrigger>
  <TooltipContent side={side} showArrow={arrow}>
    {renderTooltipBody({ subtitle, icon, avatar })}
  </TooltipContent>
</Tooltip>
```

### Example 2

```tsx
// Compact cross (Figma 45616-24177): center anchor + four arm triggers,
// each tooltip radiating outward so bubbles never overlap. Tight inner
// gaps; generous container padding makes room for the outward bubbles.
<div>
  <div />
  {trigger("top")}
  <div />
  {trigger("left")}
  <Button variant="outline" appearance="secondary">
    Component
  </Button>
  {trigger("right")}
  <div />
  {trigger("bottom")}
  <div />
</div>
```

### Example 3

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="outline">Hover me</Button>
  </TooltipTrigger>
  <TooltipContent>
    <TooltipText>
      <TooltipTitle>Saved to workspace</TooltipTitle>
    </TooltipText>
  </TooltipContent>
</Tooltip>
```

## When NOT to use

- Rich interactive content (links, forms) → Popover.
- Form-field validation → the field's helper/error slot.
- Critical must-see info — tooltips are pointer/focus-revealed only.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
