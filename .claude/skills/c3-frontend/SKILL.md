---
name: c3-frontend
description: |
  Comprehensive frontend skill for C3 AI applications. Covers React project structure,
  shadcn-style UI primitives (Radix + Tailwind), TanStack Table data grids, Recharts,
  routing, navigation, API integration, and build/lint workflow. Also covers C3 Code
  frontend (adding a frontend to a package, importing an outside React app into a
  workspace, Vite dev server in workspace Docker, UI service health management, and
  the canonical `vite.config.mts` / `c3Action.ts` contract that the UI service
  container requires).
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# Frontend C3 Instructions

## Reference Dispatch

| Task                                                                                                                                                                                              | Reference File                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **C3 Code only** — adding a frontend to a package, importing/bringing an outside React app into a C3 Code workspace, or diagnosing a broken UI preview (blank screen, 504, "UI service" errors).  | `references/code-frontend.md` |
| Must-match `vite.config.mts` for the UI service container.                                                                                                                                        | `references/vite.config.mts`  |
| Must-match `c3Action.ts` API bridge (envelope body format).                                                                                                                                       | `references/c3Action.ts`      |
| C3 Design System — styling guidelines, color tokens, border radius, typography, responsive layout principles, and Tailwind/CSS variable reference.                                                | `references/styles.md`        |
| C3 Design System **component examples** — foundations, usage cards, `ui/` sources, CSS tokens, and page templates. Start at `foundations.md` + `index.md`.                                        | `references/examples/`        |
| **Remove** `document.cookie = \`c3auth=...\`` from `App.tsx` if present (uiservice-path cookie shadows liveapp auth).                                                                             | This file — Forbidden `c3auth` cookie bootstrap |

> **Note:** `references/code-frontend.md` is **C3 Code specific**. It covers the C3 Code workspace UI service container and `UiServiceMcp` health management. If you are not working on a C3 Code package, ignore this reference. The `vite.config.mts` and `c3Action.ts` files are still useful as canonical templates regardless of the host IDE.

### ⚠️ When you MUST read `references/code-frontend.md`

- The user is bringing in / importing an outside React app, or scaffolding a frontend on a package that doesn't have one (e.g. `add-react`).
- The UI preview is broken — blank screen, 504, 401/unauthorized iframe, UI service `DEGRADED`/`ERROR`, "Cannot find module …" from Vite, or the same UI error keeps recurring after a fix.
- UI code was copied from another package in the repo.
- `ui/react/src/App.tsx` writes `c3auth` via `document.cookie` (remove it; see Forbidden `c3auth` cookie bootstrap).

If `vite.config.mts` or `src/c3Action.ts` diverges from `references/`, replace it with the reference — don't patch forward.

### When you MUST read `references/examples/`

- The user asks for a UI component (Button, Modal, Input, DataGrid, Tabs, nav, etc.) or you are about to invent props / JSX for one.
- You need the correct import path, a copy-pasteable usage snippet, or the props contract.
- You are choosing between similar components (e.g. Select vs Combobox vs MultiSelect).
- The workspace template is missing a `@/components/ui/*` file that a card imports.
- You are assembling app chrome or a standard page (list / detail / dashboard).

**How to use (agent playbook):**

1. Skim `references/examples/foundations.md` (shared props, dark mode, icons, tokens).
2. Open `references/examples/index.md`, then only the matching `*.md` card.
3. If the workspace lacks the component, copy from `references/examples/ui/`. If `src/lib/utils.ts` is missing, copy `references/examples/helpers/utils.ts` → `src/lib/utils.ts`.
4. If styles look wrong after vendoring `ui/`, merge `references/examples/styles/` (see that folder's README).
5. For page layout, start from `references/examples/page-layouts/` (`AppShell`, List/Detail/Dashboard) instead of inventing nav chrome.
6. Do not rewrite component factories from scratch. Prefer cards for usage; prefer `ui/` / `page-layouts/` for source.

## ⛔ Forbidden `c3auth` cookie bootstrap in `App.tsx`

**When opening or editing `ui/react/src/App.tsx`, or when the preview iframe is 401 / unauthorized, search for this pattern and delete it if present.** Do not leave it, comment it out, or rewrite it with a different Path.

```ts
if (import.meta.env.MODE === 'development') {
  const authToken = import.meta.env.VITE_C3_AUTH_TOKEN;
  if (authToken) document.cookie = `c3auth=${authToken}`;
}
```

Also search for `document.cookie` combined with `c3auth` or `VITE_C3_AUTH_TOKEN` and remove any equivalent write.

**Why:** C3 Code runs `npm run dev` in the UI container, so `MODE === 'development'` is true in hosted workspaces. Vite inlines `VITE_C3_AUTH_TOKEN` into client JS. Assigning `document.cookie` without `Path` uses the iframe URL (`/{env}/{app}/uiservice/`), which creates a non-HttpOnly cookie that shadows the valid `/{env}/liveapp` `c3auth` and 401s the preview.

**Do not replace it.** Dev API auth is the Vite proxy `Authorization` fallback in `vite.config.mts` (`VITE_C3_AUTH_TOKEN` stays server-side in the proxy). Genesis already sets the liveapp cookie via `User/myUser`. Do not write `c3auth` from browser JS.

## ⚠️ CRITICAL: This is a C3 Application, Not a Standalone Web App

**BEFORE writing any frontend code, identify domain entities in the user's spec.** If the spec mentions data objects (shipments, suppliers, contracts, items, users, events, orders, etc.), those MUST be modeled as C3 entity types in `src/` — never as hardcoded TypeScript data files in the frontend.

**The frontend is only ONE PART of a C3 application.** A React app with inline/local data files is NOT a C3 app. You MUST also create C3 entity types, seed/data files, and wire the frontend to fetch via `c3Action`.

**"Mock data," "local dataset," or "works offline"** in a user's spec means seed data loaded into the C3 database — NOT TypeScript constants or JSON files in the ui source folder.

## ⚠️ Build Validation

**Run `npm run build` before you show the user a version, and after a batch of related edits** (this runs lint, type-check, and bundle in sequence):

- ✅ Run `npm run build` before handing a version to the user (V1, each iteration, or final). You don't need to run the full bundle after every tiny edit — batch related changes, then validate.
- ✅ The build MUST succeed before you present a version as working
- ✅ If build fails, fix ALL errors before presenting it
- ❌ **NEVER** hand the user a version whose build is red

### Write lint-clean React the first time

The template build runs ESLint at **error** level as its first step (`npm run build` → `npm run lint && tsc && vite build`), so a single lint error blocks the whole build and the user's preview goes blank. Write code that satisfies these rules up front instead of fixing them reactively:

- **No unused imports or variables** (`@typescript-eslint/no-unused-vars`, still an error). Remove anything you don't use. For an intentionally-unused argument or destructured value, prefix it with `_` (e.g. `(_event) => ...`, `const [, setOpen] = useState(false)`).
- **No `any`** (`@typescript-eslint/no-explicit-any`, still an error). Type API responses and props with real interfaces from `@/Interfaces`. If a shape is genuinely dynamic, use `unknown` and narrow it.
- **Escape JSX entities** (`react/no-unescaped-entities`). Write apostrophes/quotes as `&apos;`/`&quot;`, or wrap the text in braces: `<p>{"It's ready"}</p>`.
- **Prefer real interactive elements** over click handlers on `<div>`/`<span>`. Use `<button type="button">` or `<a>` — this also gives you keyboard accessibility for free.
- **Associate labels with controls**: give the input an `id` and the label a matching `htmlFor` (e.g. `<label htmlFor="name">Name</label><input id="name" />`).

## ⛔ Forbidden Commands

**DO NOT USE THESE COMMANDS - THEY DO NOT EXIST:**

- ❌ `c3-mcp-cli provision-package`
- ❌ Any `provision` command variants
- ❌ Any command containing the word "provision"

**DO NOT CREATE THESE FILES:**

- ❌ README.md files in C3 packages - they are not part of the C3 package structure
- ❌ Documentation files in the package root - use comments in code instead

## ⛔ Forbidden Data Patterns

**DO NOT hardcode domain data in the frontend as your final implementation:**

- ❌ Large TypeScript files with arrays of objects as the data source (e.g., `src/data/myData.ts`)
- ❌ Inline JSON datasets in React components
- ❌ Mock data files in ui source folder that serve as the permanent data layer

**These are acceptable ONLY as temporary placeholders** during Step 3 of the Development Workflow (dummy data). They MUST be replaced with `c3Action` calls by Step 7.

## Project Structure

- Frontend lives under the `<pkg_name>/ui/react/` folder.
- Page components go in `<pkg_name>/ui/react/src/pages/<PageName>/`. REPLACE the `<DemoPage>` with something relevant to the User.
- Shared components go in `<pkg_name>/ui/react/src/components/<ComponentType>/`.
- **Every page MUST be registered as a route.** When you create a page component in `<pkg_name>/ui/react/src/pages/<PageName>/`, add its `<Route>` to `<pkg_name>/ui/react/src/App.tsx` in the same change — a page with no route renders BLANK when navigated to. For a list/detail feature, register BOTH the list route (`/x`) and the detail route (`/x/:id`). Add a nav item in `SideNav.tsx` / `<pkg_name>/ui/react/src/config/navigation.ts` only for top-level pages (detail, modal, and sub-pages are routed but typically not in the nav). Never remove the SideNav.
- Navigation configuration is centralized in `<pkg_name>/ui/react/src/config/navigation.ts`.
- Organize by feature: group related components, pages, and utilities together.
- ALWAYS copy from examples at `<pkg_name>/ui/react/resources/examples/pages/` and `<pkg_name>/ui/react/resources/examples/components` when possible.

## API Calls and Backend Integration

Use the appropriate helper based on whether the backend method is **static** or **member**:

| Helper           | Use for                                        | Signature                                                                     |
| ---------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `c3Action`       | Static/class-level methods                     | `c3Action(typeName: string, method: string, spec?: any)`                      |
| `c3MemberAction` | Member methods                                 | `c3MemberAction(typeName: string, method: string, instance: any, spec?: any)` |
| `c3CreateAction` | `create` / `upsert` — **use only when needed** | `c3CreateAction(typeName: string, method: string, spec: any)`                 |

```ts
// STATIC methods, TypeName is always prepended to the POST body
await c3Action('<TypeName>', '<staticMethod>', [<arg1>, <arg2>]);
// → POST body: ["<TypeName>", <arg1>, <arg2>]

// INSTANCE methods, Any identifying object can be the instance (e.g. { id }, { name }, etc.)
// spec can be 'this' (to fetch the full object) or any array of method arguments
await c3MemberAction('<TypeName>', '<memberMethod>', { id: '<instanceId>' }, [<arg1>, <arg2>]);
// → POST body: [{ id: "<instanceId>" }, <arg1>, <arg2>]

// CREATE — c3CreateAction: for create/upsert only; no TypeName or instance prepended
await c3CreateAction('<TypeName>', 'create', { <field1>: <value1>, <field2>: <value2> });
// → POST body: [{ <field1>: <value1>, <field2>: <value2> }]
```

- **IMPORTANT**: `c3Action` returns whatever the backend implementation returns (Python or JavaScript). There is NO wrapper object - don't use `.value`, `.data`, or any other property.

- **ALWAYS reference the examples** in `resources/examples/shared/api.ts` and example pages for correct patterns. Here are the key patterns:

```ts
// fetch() returns { objs: [], count: number }
const response = await c3Action('Document', 'fetch', { limit: -1 });
const documents = response.objs; // Access .objs from fetch result

// Custom method returns array directly
const cars: Car[] = (await c3Action('Car', 'getAll', [])) || [];

// Custom method returns single object directly
const car: Car = await c3Action('Car', 'getById', [id]);

// Using fetch with filters (see resources/examples/shared/api.ts)
const fetchDocuments = async (limit: number, offset: number, filters?: DocumentFilters) => {
  const filterSpec: Record<string, unknown> = { limit, offset };
  // ... build filter conditions ...
  const response = await c3Action('Document', 'fetch', filterSpec);
  return {
    objs: response.objs,
    count: response.count,
  };
};
```

- **Key distinction**: The built-in `fetch()` method always returns `{ objs: [], count: number }`. Custom methods like `getAll()` or `getById()` return whatever your Python/JS implementation returns.

- Ensure `<methodName>` exists in `src/<TypeName>.c3typ` and is implemented in `src/<TypeName>.py` or `src/<TypeName>.js`. If missing, use MCP tools to create both.
- Handle loading states and error scenarios appropriately.

### ⚠️ Fetch with relationships — get the FetchSpec shape right

These two specific failure modes silently break `fetch()` calls and force the UI back to fallback/mock data. Both have been observed in real generated apps — DO NOT repeat them.

**1. Pass the FetchSpec directly. DO NOT wrap it in `{ spec: ... }`.**

`c3Action(typeName, action, spec)` already builds the platform-correct envelope for you. Wrapping the spec in another object produces an invalid request body and the call returns 500.

```ts
// ✅ CORRECT — FetchSpec is the third argument directly
const response = await c3Action('Shipment', 'fetch', {
  limit: -1,
  include: 'this, supplier.id, supplier.name, item.id, item.name',
  filter: "status == 'In Transit'",
});

// ❌ WRONG — extra { spec: ... } wrapper, returns 500
const response = await c3Action('Shipment', 'fetch', {
  spec: { limit: -1, include: '...' },
});
```

**2. For nested/related fields, use FLAT dot-notation. DO NOT use parenthetical `field.(sub1,sub2)` syntax.**

The C3 fetch API generates SQL JOINs from the `include` string. Parenthetical syntax produces invalid JOIN clauses and the call returns 500. Flat dot-notation works.

```ts
// ✅ CORRECT — flat dot-notation, comma-separated
include: 'this, agency.id, agency.name, supplier.id, supplier.name'

// ❌ WRONG — parenthetical syntax, returns 500
include: 'this, agency.(id,name), supplier.(id,name)'
```

Always include `this` first when you also need the entity's own scalar fields. If you only need referenced fields, you can omit it.

### ✅ Verifying the wire-up — required before declaring "done"

A `fetch` call that compiles is not the same as a `fetch` call that works. After wiring `c3Action` calls into the UI, **validate the wiring** before declaring the task complete. Use whichever runtime tools your environment provides — in order of preference:

1. **Run the entity's `fetch` directly through an app/runtime MCP** (e.g. `C3AI-AppMCP`'s `runJsCode` to execute `<TypeName>.fetch({ limit: 1, include: 'this, refField.id' })`) and confirm it returns records — not an error. Do this for every type the UI displays.
2. **If browser automation is available** (e.g. `C3AI-PlaywrightMCP`), navigate every page that displays data, open the network tab, and confirm every `/api/8/<TypeName>/fetch` returns **200 OK** and the rendered values match seeded records.
3. **If neither is available**, at minimum re-read each `c3Action` / `c3MemberAction` call you wrote and verify against the rules above (no `{ spec: ... }` double-wrap, flat dot-notation in `include`).

Whichever path you take, **delete every mock/dummy data file** (e.g. `ui/react/src/data/mockData.ts`) and remove any inline hardcoded arrays from components once `c3Action` wiring is in place. **There is no fallback after wire-up** — a broken `c3Action` call must surface as a visible error in the UI, never silently hide behind mock data.

If a `fetch` call fails, inspect the error message to find the cause (most commonly the two FetchSpec issues above) and fix it before proceeding.

## Typing and Interfaces

- Always write in **TypeScript** with strict types.
- Add any new entity types to `<pkg_name>/ui/react/src/Interfaces.tsx`. Use clear, descriptive interfaces:

```ts
export interface WindTurbine {
  id: string;
  identifier: string;
  status: 'Operational' | 'Maintenance' | 'Offline';
  facility: Facility;
  sensors: Sensor[];
  meta: Meta; // Always include meta for C3 entities
}

export interface Sensor {
  id: string;
  temperature: number;
  windTurbine: WindTurbine;
  readings: SensorReading[];
}
```

- Use enums for status fields and other constrained values.
- Always include proper typing for API responses and component props.

## Component Architecture & Guidelines

- **shadcn-style primitives + Tailwind CSS**: The templates ship a small set of shadcn-style components in `src/components/ui/` built on Radix UI primitives (via the `radix-ui` package) and styled with **Tailwind v4** plus C3 design tokens. Always import primitives from `@/components/ui/*`:

```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
// Icons — use lucide-react
import { Pencil, Trash2, Plus, Search, Smile } from 'lucide-react';
// Use: <Pencil className="size-4" /> or <Smile className="size-4" aria-hidden />
```

- **What's available** (in `src/components/ui/`): starter set often includes `button`, `input`, `textarea`, `checkbox`, `select`, `dialog`, `tabs`, `table`, `data-table`, `skeleton`, `collapsible`. For design-system components beyond that (and for verified import/props/examples), read `references/examples/foundations.md` + `index.md`, then the matching card. Vendor missing files from `examples/ui/`, `cn` backup from `examples/helpers/utils.ts` → `src/lib/utils.ts`, tokens from `examples/styles/`, and layouts from `examples/page-layouts/`.

- **Charts**: use **Recharts** (`recharts`) for charts (line, bar, pie, area). The templates wrap charts in `<ResponsiveContainer>`.

- **Icon Usage Guidelines**:

  - Use `lucide-react` icons — the standard icon library for C3 Code projects
  - Size with Tailwind: `className="size-4"` (small, 1rem), `className="size-5"` (medium, 1.25rem)
  - If `npm install` fails with E401 or 403 errors related to `@fortawesome` packages, use the `c3-fontawesome-migration` skill

- **Component structure**: Follow this pattern for all components:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { MyEntity } from '@/Interfaces';
import { c3Action } from '@/c3Action';
import { Button } from '@/components/ui/button';

interface MyComponentProps {
  entityId?: string;
  onUpdate?: (entity: MyEntity) => void;
  isLoading?: boolean;
}

export default function MyComponent({ entityId, onUpdate, isLoading = false }: MyComponentProps) {
  const [data, setData] = useState<MyEntity[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    // API logic here
  }, [entityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return <div className="p-4">{/* Component JSX with Tailwind classes */}</div>;
}
```

- **Data grids**: Use the shared **`DataTable`** at `@/components/ui/data-table` (TanStack Table + shadcn Table) for tabular data — it handles sorting, pagination (client or server), and empty states. Define columns with `ColumnDef<TData>`. Make grids full-width via Tailwind (e.g. `className="w-full"`) — do **not** use pixel widths.

```tsx
import { DataTable, type ColumnDef } from '@/components/ui/data-table';

interface DocumentRow {
  documentName: string;
  owner: string;
  checklistApplied: boolean;
}

const columns: ColumnDef<DocumentRow>[] = [
  { accessorKey: 'documentName', header: 'Document Name' },
  { accessorKey: 'owner', header: 'Owner' },
  {
    accessorKey: 'checklistApplied',
    header: 'Checklist Applied',
    // Custom cell renderer — return any JSX
    cell: ({ row }) => (
      <span className={row.original.checklistApplied ? 'text-success' : 'text-danger'}>
        {row.original.checklistApplied ? 'Yes' : 'No'}
      </span>
    ),
  },
];

// Server-side pagination (omit `pagination` for client-side)
<DataTable
  data={documents}
  columns={columns}
  pagination={{
    pageIndex,
    pageSize,
    totalCount,
    mode: 'server',
    pageSizes: [10, 25, 50],
    onPageChange: (nextIndex, nextSize) => {
      setPageIndex(nextIndex);
      setPageSize(nextSize);
    },
  }}
/>;
```

- **Forbidden practices**:
  - **NO** `console.log` or `console.error` in production code
  - **NO** inline styles — use Tailwind CSS classes
  - **NO** `any` types — always use proper TypeScript interfaces

## Component Guidelines

- **Do not** use `console.log` or `console.error` for debugging.
- Use shadcn-style primitives with Tailwind CSS styling:
  - Layout: Use Tailwind classes like `flex`, `grid`, `p-4`, `m-2`
  - Data grids: `DataTable` from `@/components/ui/data-table` (or raw `Table` from `@/components/ui/table` for static layouts)
  - Forms: `Input`, `Textarea`, `Checkbox`, `Select` from `@/components/ui/*`
  - Buttons: `Button` from `@/components/ui/button`
  - Dialogs / modals: `Dialog` family from `@/components/ui/dialog`
  - Tabs: `Tabs` family from `@/components/ui/tabs`
  - Charts: `recharts` (line, bar, pie, area) wrapped in `<ResponsiveContainer>`
  - Icons: `lucide-react` — the standard icon library for C3 Code projects
  - Theme-aware classes: `bg-primary`, `text-secondary`, `border-weak`, `c3-card`
  - Before inventing props/JSX for a design-system component, check `references/examples/` (catalog: `index.md`; implementations: `ui/`)
- Follow React best practices:
  - Use functional components with hooks
  - Implement proper error boundaries
  - Use `useCallback` and `useMemo` for performance optimization
  - Handle loading and error states gracefully
  - ALWAYS Fix all `npm run build` errors

## Routing and Navigation

- Use React Router for navigation
- Add new routes to `App.tsx` and corresponding navigation items to `SideNav.tsx`
- Implement proper route guards for admin/advanced user features
- Use lazy loading for page components to improve performance

## Error Handling

- Use try/catch blocks to wrap API calls to the backend
- Use try/catch blocks in event handler functions, if the event handler functions include business logic beyond just setting state values
- Import and use the `useErrorBoundary` hook defined in `ErrorBoundary.tsx`
- In catch blocks, use the function `reportError`, which is returned by the `useErrorBoundary` hook, so that our custom error handling functionality is activated
- DO NOT EVER create a try/catch block with an empty catch block; ALWAYS use `reportError` function, then add any additional logic needed in the catch block
- Examples of correct and incorrect error handling below:

```tsx
// Importing and using useErrorBoundary hook
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
const { reportError } = useErrorBoundary();

// GOOD: Using `reportError` function in try/catch block in API call
const handleDeleteUser = async (userId: string) => {
  try {
    await c3Action('User', 'remove', { id: userId });
    fetchData();
  } catch (err) {
    reportError(err);
  }
};

// GOOD: Using `reportError` function in event handler
const handleButtonClick = (e: Event) => {
  try {
    if (e.value === 'foo') {
      setSomeStateValue('bar');
    } else {
      setSomeStateValue('baz');
    }
  } catch (err) {
    reportError(err);
  }
};

// BAD: Empty catch block - do not do this
const handleAddUser = async (userInfo: object) => {
  try {
    await c3Action('User', 'add', userInfo);
  } catch {}
};
```

## Performance and Best Practices

- Implement proper loading states for all async operations
- Use React Query or similar for server state management when appropriate
- Optimize expensive computations with `useMemo`
- Avoid unnecessary re-renders with `useCallback`
- Make pages and grids responsive to page/screen size change.
- Use TypeScript strict mode for better type safety
- Use the shadcn-style primitives in `src/components/ui/*`.
- Before creating a new component, search `resources/examples/pages/` and `resources/examples/components` for an existing component to copy
- ALWAYS Fix all `npm run build` errors
- For responsive breakpoints, use the shared hooks in `src/hooks/`:
  - `useMdBreakpointUp()` — true when viewport is at least `md` (≥ 768px)
  - Do NOT use raw `window.innerWidth` checks; prefer these reactive hooks instead.

## File Operations

- Always use the provided MCP or CLI tools to create or edit files; do not manually copy or `cat` files.

### Package Creation Commands

```bash
# List all available templates (RUN THIS FIRST to see options)
c3-mcp-cli list-templates

# Create a default package
c3-mcp-cli create-c3-package --name <packageNameInCamelCase>

# Create a package with a specialized template
c3-mcp-cli create-c3-package --name <packageNameInCamelCase> --template <templateName> --agent <cursor|copilot|claude|genesis>

# Add React to an existing package
c3-mcp-cli add-react [--name <packageName>]
```

**Notes:**

- Package names must be in **camelCase**
- Run `list-templates` to see all available templates with descriptions and required dependencies
- Specialized templates (`--template`) require the `--agent` flag to specify your IDE (cursor, copilot, or claude)
- The `create-c3-package` command generates `<pkg_name>/react/`, `<pkg_name>/src/`, `<pkg_name>/test/`, `<pkg_name>/seed/`, and `<pkg_name>.c3pkg.json`. In C3 Code (Genesis templates and the preview UI service), the frontend lives at `<pkg_name>/ui/react/`.

## Browser Testing & Screenshots

If the Playwright MCP tool is available, use it to interact with the UI, take screenshots as needed, and verify your changes visually.

- Server runs at **localhost:9002/mcp**
- Screenshots saved to `/usr/workspace/.playwright/`
- Always save screenshots to a file using the `filename` parameter rather than embedding in the response.
- Prefer `fullPage: false` (viewport-only) to reduce file size. Only use `fullPage: true` if specifically requested.
- Use the Read tool on the saved file path to view screenshots.
- **Always check the browser console and network tab for errors after navigation and fix any issues found.**

```
mcp__C3AI-PlaywrightMCP__browser_take_screenshot
- type: "png"
- filename: "my-screenshot.png"
- fullPage: false
```

### Where to point Playwright (preview URL)

When navigating with the Playwright MCP, the app preview is at `http://localhost:9000`. The full route URL is:
`http://localhost:9000/<env>/<app>/uiservice/#/<route>` — the base path `/<env>/<app>/uiservice/` comes from `vite.config.mts`.

No authentication is needed — the Vite dev server proxy automatically attaches the user's auth token to all proxied API requests.

**When a user reports "blank screen" or "can't see the app":**
1. Navigate Playwright directly to `http://localhost:9000` — confirm the page loads.
2. If the server is up but a specific page is blank, its path has no matching `<Route>` — add it (see Routing above).
3. If the page is unreachable or the dev server itself is unhealthy, follow the UI service recovery flow in `references/code-frontend.md` (status check, re-ensure, poll until `running`).
## ⚠️ Preview Safety & Performance (MANDATORY)

Browsers are memory-intensive environments. Code that consumes too much memory or keeps the CPU busy in the preview will **freeze the entire C3 Code UI** — including the chat panel — before any error boundary or health check can react. Apply every rule below to all code that runs inside the preview.

### Never fetch unbounded data

Always pass `limit` and `offset` to every `fetch` / `c3Action` call. Fetching an entire large type allocates a massive JS object, spikes memory, and can crash the tab.

```ts
// ❌ kills the browser on any large type
const result = await c3Action('MyType', 'fetch', {});

// ✅ always paginate
const result = await c3Action('MyType', 'fetch', { limit: 50, offset: 0 });
// result.objs — array of records; result.count — total for pagination UI
```

If the UI needs to show "all" records, load them in pages and render incrementally — never load unbounded data up front.

### Never poll without a safe minimum interval

Polling loops must have a minimum interval. Polling faster than **2 seconds** on any non-trivial fetch is unsafe and will saturate the event loop.

```ts
// ❌ spins the event loop, freezes the shell within seconds
useEffect(() => {
  const id = setInterval(() => fetchData(), 100);
  return () => clearInterval(id);
}, []);

// ✅ safe minimum; always clean up on unmount
useEffect(() => {
  const id = setInterval(() => fetchData(), 5000); // ≥ 5 s for data fetches
  return () => clearInterval(id);
}, []);
```

### Always cancel async work on unmount

`useEffect` cleanup **must** cancel in-flight fetches and clear all timers. Orphaned promises that call `setState` on an unmounted component keep large response payloads alive in memory and cause React warnings.

```ts
useEffect(() => {
  let cancelled = false;
  fetchData().then((data) => {
    if (!cancelled) setData(data);
  });
  return () => { cancelled = true; };
}, [dependency]);
```

### Cap rendered list sizes

Never render an unbounded array directly into the DOM. Use pagination, virtualisation (`react-window` / `react-virtual`), or a hard cap with a "load more" affordance.

```tsx
// ❌ renders 10,000 <tr> elements — hangs the page
{items.map(item => <Row key={item.id} item={item} />)}

// ✅ hard cap; tell the user there are more
const PAGE_SIZE = 100;
{items.slice(0, PAGE_SIZE).map(item => <Row key={item.id} item={item} />)}
{items.length > PAGE_SIZE && <p className="text-xs text-secondary">{items.length - PAGE_SIZE} more — refine your filter.</p>}
```

### Memoize expensive derived data

Wrap any computation that maps/filters/sorts a fetched list in `useMemo`. Recomputing on every render forces garbage collection at frame rate.

```ts
// ❌ recomputes on every render
const sorted = items.sort((a, b) => a.name.localeCompare(b.name));

// ✅ only recomputes when items changes
const sorted = useMemo(
  () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
  [items]
);
```

### Why this matters

Violating any of the rules above can make the preview consume so much memory or CPU that the entire C3 Code UI becomes unresponsive. There is a watchdog that will auto-reset the preview, but it is a **safety net**, not a substitute for defensive data-access patterns. Fix the root cause — don't rely on the reset.

---

## 🚨 Checklist

**Before you show the user ANY version (every version must be a real C3 app):**

1. ✅ Run `npm run build` - runs lint, type-check, and bundle; fix all errors
2. ✅ No TypeScript compilation errors; imports correct and components render
3. ✅ **C3 entity types exist** in `<pkg_name>/src/` for the domain entities the current UI shows
4. ✅ **Seed/data files exist** and have been upserted for those entity types
5. ✅ **The UI fetches from the C3 backend** using `c3Action` — no hardcoded data as the data source
6. ✅ **No mock/dummy/fallback data files remain in `ui/react/src/`** — the UI renders real backend data or shows an error; it does NOT fall back to hardcoded data
7. ✅ **Lightweight runtime check** — replay one `<TypeName>.fetch()` per new type via an app/runtime MCP, or re-read the `c3Action` calls against the FetchSpec rules above

**Hardening pass — only when the user asks for tests/hardening:**

- ✅ Full per-page runtime sweep (browser network tab via `C3AI-PlaywrightMCP`, every `c3Action` returns 200 OK)
- ✅ Tests for non-trivial business logic

Do not run the hardening pass by default — offer it when a working version exists (prototyping mode) and follow the user's direction; otherwise wait for an explicit ask.
