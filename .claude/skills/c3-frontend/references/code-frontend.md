# C3 Code Frontend

## Adding a Frontend to a Package

When a user asks to add a frontend to a C3 package, **do not blindly** copy UI code from existing packages in the repository. Other packages in the repo may use different frameworks, bundlers, or patterns that are incompatible with C3 Code's UI service container.

Instead, use the canonical must-match files below. These are the framework-level contract that **must match exactly** for the UI service to work:

### Must-Match Files

These files form the framework-level contract between the UI service container and the frontend app. When adding a frontend manually, use these exact files. Only modify application-specific code (pages, components, styles).

**1. `vite.config.mts`** — See `vite.config.mts` in this references directory.

Copy this file verbatim to the package's `ui/react/vite.config.mts`. Key requirements:

- File extension must be `.mts`
- Proxy routes for `/api`, `/remote`, `/thirdparty`, `/typesys` with `c3auth` header injection
- Build output to `../content/${pkgName}` with deterministic (non-hashed) filenames
- Base path: `/${env}/${app}/uiservice/` in dev, `./` in build

**2. `src/c3Action.ts`** — See `c3Action.ts` in this references directory.

Copy this file verbatim to the package's `ui/react/src/c3Action.ts`. This is the C3 API bridge — every frontend must have it. Provides three helpers: `c3Action` (static methods), `c3CreateAction` (create/upsert), and `c3MemberAction` (member methods).

### Forbidden: `App.tsx` must not write `c3auth`

On any frontend task (especially iframe 401 / unauthorized preview, copying UI from another package, or editing `App.tsx`), search `ui/react/src/App.tsx` for:

```ts
document.cookie = `c3auth=${authToken}`
```

or `VITE_C3_AUTH_TOKEN` used to set a cookie. **Delete the entire development-mode block** if found. Do not add a `Path`, `Secure`, or `HttpOnly` variant.

That write creates `Path=/{env}/{app}/uiservice`, which shadows the liveapp `c3auth` cookie. Auth for proxied `/api` requests belongs in `vite.config.mts` (`Authorization` from the incoming request, then cookie, then `VITE_C3_AUTH_TOKEN` fallback) — not in browser JS.


# UI Service Health: Status Checking and Re-Ensuring

The UI preview runs inside a separate Docker container (the "UI service") which hosts a Vite dev server process. The Agent container and the UI container are independent — fixing code on the agent side does NOT automatically restart the Vite process in the UI container. You **must** proactively manage UI service health.

## When to Check UI Service Status

Check the UI service status (`UiServiceMcp.status(workspaceId)`) when:

1. **The user reports the same UI error repeatedly** after you believe you've fixed it. This is the strongest signal that the Vite dev server is in a bad state and needs re-ensuring.
2. **After fixing import errors, missing dependencies, or package.json changes** — the Vite process may have already crashed or entered an error state before your fix.
3. **When the UI preview shows a 504 gateway error or blank screen** — the Vite process may have exited entirely.

## UI Service Statuses Explained

The UI service has two independent phase systems:

| Phase System                    | Tracks                                  | Values                                                 |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| **Service Phase** (REST server) | The Express API server in the container | `STARTING`, `RUNNING`, `STOPPING`, `DEGRADED`, `ERROR` |
| **App Phase** (Vite dev server) | The child `npm run dev` process         | `starting`, `running`, `error`, `exited`, `waiting`    |

**Service Phase meanings:**

- `RUNNING` — Container REST server is healthy and serving requests.
- `DEGRADED` — REST server is up but the Vite app process has issues (compilation errors, exited).
- `ERROR` — REST server itself failed to start or crashed.
- `STARTING` — Container is still initializing.
- `STOPPING` — Container is shutting down gracefully.

**App Phase meanings:**

- `running` — Vite dev server is running normally. HMR is active. No action needed.
- `error` — Vite encountered compilation/lint errors. The process is still alive and HMR may recover if you fix the code. However, if the user continues to see the error after your fix, **re-ensure**.
- `exited` — The Vite process has terminated completely. **MUST re-ensure** — HMR cannot recover from this.
- `waiting` — No UI directory found on disk (backend-only repo or not yet mounted). No action needed.
- `starting` — Vite is starting up (npm install + dev server launch in progress). Wait for it to complete.

## When to Re-Ensure

Call `UiServiceMcp.ensure(workspaceId)` when:

1. **App phase is `exited`** — The process is dead. Only re-ensure can bring it back.
2. **App phase is `error` AND you've already fixed the code** — If HMR didn't recover (user still sees the error), a full restart is needed.
3. **The user keeps sending the same UI error to fix and you believe the issue is already resolved in the code** — This is the classic scenario: the code is correct but the Vite process is stuck in a bad state from before your fix.
4. **After modifying `package.json` dependencies** — The Vite process needs to pick up new `node_modules`.

**Important:** `ensure` triggers a restart but the process takes time to become fully ready (npm install + Vite startup). After calling ensure, you **must** poll `UiServiceMcp.status(workspaceId)` until the app phase becomes `running` before telling the user the fix is complete.

## Decision Flow

```
User reports UI error
  → Fix the code
  → Check status: UiServiceMcp.status(workspaceId)
  → If appPhase == 'running': wait for HMR to pick up changes
  → If appPhase == 'error': code fix may self-heal via HMR, monitor
  → If appPhase == 'exited': MUST call UiServiceMcp.ensure(workspaceId)
  → If user reports same error again after fix:
      → Call UiServiceMcp.ensure(workspaceId) to fully restart
  → After calling ensure:
      → Poll UiServiceMcp.status(workspaceId) every ~5 seconds
      → Wait until appPhase becomes 'running'
      → Only then confirm the fix to the user
```
