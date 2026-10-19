# Tabs

Switch between sibling views with two visual treatments: a raised pill row (`boxed`) or an
underlined baseline (`bordered`). Three trigger sizes.

## Import

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
```

## Examples

### Example 1

```tsx
<Tabs variant={variant} size={size} defaultValue="users">
  <TabsList>
    {PLAYGROUND_TABS.map(({ value, label, icon: Icon }) => (
      <TabsTrigger key={value} value={value}>
        {showIcon && <Icon />}
        {showText && label}
        {showIndicator && (
          <Badge variant="indicator" appearance="accent" />
        )}
      </TabsTrigger>
    ))}
  </TabsList>
  {PLAYGROUND_TABS.map(({ value, label }) => (
    <TabsContent key={value} value={value}>
      {label} panel
    </TabsContent>
  ))}
</Tabs>
```

### Example 2

```tsx
<div>
  {VARIANTS.map((v) => (
    <section key={v}>
      <h3>
        {v} tabs
      </h3>
      <div>
        <div>
          {SIZES.map((s) => (
            <div key={s}>
              <div>
                {s}
              </div>
              <div>
                {STATES.map((state) => (
                  <div key={state.label}>
                    <StateCell
                      variant={v}
                      size={s}
                      selected={state.selected}
                      disabled={state.disabled}
                    />
                    <div>
                      {state.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  ))}
</div>
```

### Example 3

```tsx
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">Overview panel</TabsContent>
  <TabsContent value="activity">Activity panel</TabsContent>
</Tabs>
```

### Example 4

```tsx
<Tabs variant="bordered" size="md" defaultValue="home">
  <TabsList>
    <TabsTrigger value="home"><Home /> Home</TabsTrigger>
    <TabsTrigger value="profile"><User /> Profile</TabsTrigger>
    <TabsTrigger value="settings"><Settings /> Settings</TabsTrigger>
  </TabsList>
</Tabs>
```

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `boxed \| bordered` | `boxed` | `boxed` = grey pill row with a raised white active chip; `bordered` = baseline rule with an accent underline. |
| `size` | `sm \| md \| lg` | `md` | Trigger height & padding. |
| `defaultValue` | `` | — | standard Radix Tabs props. |
| `value` | `` | — | standard Radix Tabs props. |
| `onValueChange` | `` | — | standard Radix Tabs props. |

## When NOT to use

- Navigation between pages — use the router/nav primitives.
- More than ~6 destinations — a sidebar or dropdown.
- Selecting a value from an enum — use Select/Dropdown.

## Notes

- Prefer these components over hand-rolled equivalents when building C3 app UI.
- Style with design-system tokens / semantic Tailwind classes only — never hardcode hex, px, or primitive palette colors.
- Dark mode is token-driven via `[data-theme="dark"]`; do not add separate `dark:` style forks.
