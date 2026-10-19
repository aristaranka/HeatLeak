# Card

Generic content surface. Composable subcomponents (`CardHeader`, `CardTitle`, `CardDescription`,
`CardAction`, `CardContent`, `CardFooter`, `CardMedia`) cover all 27 content patterns in the Figma
"Card Example" frame — 9 categories × 3 variances each — from a single, content-agnostic primitive.

## Import

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter, CardMedia } from '@/components/ui/card';
```

## Examples

### Example 1

```tsx
<div>
  {(["outlined", "elevated", "flush"] as const).map((variant) => (
    <Card key={variant} variant={variant}>
      <CardHeader>
        <CardTitle>{variant}</CardTitle>
      </CardHeader>
      <CardContent>Body text.</CardContent>
      <CardFooter>
        <Button size="sm">Primary</Button>
        <Button variant="ghost" size="sm">
          Secondary
        </Button>
      </CardFooter>
    </Card>
  ))}
</div>
```

### Example 2

```tsx
<div>
  {VARIANTS.map((variant) => (
    <section key={variant}>
      <h3>
        {variant} Card
      </h3>
      <div>
        {SIZES.map((size) => (
          <Card key={`${variant}-${size}`} variant={variant} size={size}>
            <CardHeader>
              <CardTitle>{size}</CardTitle>
              <CardDescription>Category</CardDescription>
            </CardHeader>
            <CardContent>Body text scales with size.</CardContent>
            <CardFooter>
              <Button size={FOOTER_BUTTON_SIZE[size]}>Confirm</Button>
              <Button variant="ghost" size={FOOTER_BUTTON_SIZE[size]}>
                Cancel
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  ))}
</div>
```

### Example 3

```tsx
    <Card size="sm">
      <CardMedia>
        <div>
          16:9 media slot
        </div>
      </CardMedia>
      <CardHeader>
        <CardTitle>Image card</CardTitle>
      </CardHeader>
      <CardContent>CardMedia bleeds edge-to-edge via a negative margin that cancels the card's padding.</CardContent>
    </Card>
  ),
}

export const WithAction: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>Category 1</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="More">
            ···
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>Body text describing this card's content goes here.</CardContent>
      <CardFooter>
        <Button size="sm">Primary</Button>
        <Button variant="ghost" size="sm">
          Secondary
        </Button>
      </CardFooter>
    </Card>
```

### Example 4

```tsx
<Card data-testid="bordered-footer-card">
  <CardHeader>
    <CardTitle>Bordered footer</CardTitle>
  </CardHeader>
  <CardContent>Footer below has a top rule.</CardContent>
  <CardFooter bordered>
    <Button size="sm">Save</Button>
  </CardFooter>
</Card>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `outlined \| elevated \| flush` | `outlined` | `outlined` = surface + border (matches every Figma variant). `elevated` adds `shadow-sm` for cards floating over a busy canvas. `flush` drops the border/shadow when the parent already supplies separation. |
| `size` | `sm \| md \| lg` | `md` | Controls internal padding + child gap; also read by `CardFooter`/`CardMedia` via context so their edge-bleed math matches the card's own padding. |
| `bordered` | `boolean` | `false` | Adds a top rule + inset padding to read as an action bar. |
| `src` | `` | — | render an `img` directly; omit `src` and pass `children` for anything else (chart, video thumbnail, custom markup). |
| `alt` | `` | — | render an `img` directly; omit `src` and pass `children` for anything else (chart, video thumbnail, custom markup). |

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
