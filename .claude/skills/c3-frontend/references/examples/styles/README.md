# C3 design-system CSS entrypoints

Required when you vendor components from `../ui/` into an app.

## Import order (in the app global stylesheet)

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/inter";
@import "./tokens.css";
@import "./manual-tokens.css";
```

Then keep the `@custom-variant dark` and `@theme inline` blocks from `index.css`.

In c3design, `index.css` lives at `src/index.css` and imports `./styles/tokens.css`.
When copying into a C3 Code package, place these next to `globals.css` (or merge the
imports into it) so `--c3-style-*` and `text-c3-*` resolve.

> Auto-copied by `npm run skills:examples`. Do not edit by hand.
