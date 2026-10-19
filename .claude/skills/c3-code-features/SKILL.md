---
name: c3-code-features
description: |
  Answer end-user "how do I…" / "where is…" questions about the C3 Code product's own workspace shell — its Preview/Code/Configure tabs, header menus, Settings pages, and the tools launcher — NOT how to build or debug the application you are developing inside it. Use when a user asks where to click to reach or use a workspace tool or setting: Jupyter, C3 Console, C3 AI Studio, Data Fusion, File Explorer, Logs, job monitors (batch/cron/mapreduce/spark), Feature Store, Model Ops, MCP servers/tools; toggling hibernation; deploying or sharing the app; inviting collaborators or giving a teammate access to the workspace (the Collaborators tab); connecting Git; adding MCP servers; changing the coding harness / agent backend; advanced mode; downloading or exporting a chat session; or starting/stopping/restarting the workspace. Assumes the user is already in the workspace view. This covers only the C3 Code tool's own chrome — anything about the user's own application (its pages and screens, entity types, methods, agents, data ingestion, or APIs) belongs to c3-frontend / c3-backend-code / agentix-agent-authoring / c3-data-ingestion, not here.
core: false
category: platform
version: 8.11.0
minimumVersion: 8.11.0
---

# C3 Code Product Features & Navigation

Use this to answer **product/navigation questions** about the **C3 Code UI** (Jupyter, Console, hibernation, deploy, collaborators, etc.) — **not** how to build C3 app code (for that, use `c3-frontend`, `c3-backend-code`, …).

**Starting point:** the user is in their **workspace** (`…/workspaces/<workspaceId>`).

**The workspace header has three tabs: `Preview` · `Code` · `Configure`.**
- The **tools launcher** (the "+"/Get Started grid) lives **only on `Configure`** — not `Preview`/`Code`. So step 1 for any launcher tool is **switch to `Configure`**.
- **Workspace Settings** and the header **Deploy / Share / Git** actions work from any tab.
- Non-admin (read-only) workspace users still **see** `Configure` and `Code`, but the tabs are **disabled**, with the tooltip *"Workspace admin access is required to edit this workspace."* If the tabs are greyed out, the user lacks workspace-admin access. If `Configure`/`Preview` are **missing entirely**, the workspace isn't backed by a C3 app (or its config hasn't loaded yet) — that's not an access problem.

**Answering style:** give the **click path** in short numbered steps using the **exact labels** below; flag when a feature needs **admin** access or a **running** workspace; **never** tell the user to "sync" (C3 Code auto-syncs); if unsure a path exists, say so instead of inventing one.

## Tools Launcher

On the **`Configure` tab**, click **"+" (Add new tab)** → the **Get Started** grid → **search or click a tile**. Sections and tiles:

| Section | Tiles |
| --- | --- |
| **Administration** | Downloads, Requests, User Management |
| **Agents** | Agent Deployments, Evaluation, Agent Gallery, Agentic Workflows *(coming soon)* |
| **Data** | Data Fusion, Data Integration, Data Lakehouse, Data Sharing, File Explorer, Visual Notebooks |
| **Development Tools** | C3 AI Studio, C3 Console, Jupyter |
| **Machine Learning** | Feature Store, Model Ops |
| **MCP** | MCP Access, MCP Monitor, MCP Prompts, MCP Servers, MCP Tools |
| **Model Hub** | Authentication, Model Clients |
| **Monitoring** | Action Profiler, Alert Center, App Monitoring, Batch Jobs, Cron Jobs, Logs, MapReduce Jobs, Services, Spark Executions Jobs, Workflow Jobs, Workload Management |

- **Jupyter**, **C3 Console**, and **C3 AI Studio** open in a **new browser tab**; every other tile opens **embedded**. These three new-tab tiles are **disabled unless the workspace is running (READY)** — start the workspace first (the tile's tooltip shows the current workspace status).
- Most embedded tools need the **app running**; Action Profiler, Alert Center, App Monitoring, Logs, and Services work even when it isn't (they render regardless; the others show a loading state until the workspace is ready).

## Common answers

- **Jupyter / C3 Console / C3 AI Studio:** `Configure` → **"+"** → **Development Tools** → the tile. Opens in a new browser tab. These tiles are **disabled unless the workspace is running (READY)** — start it first.
- **File Explorer / Logs / job monitors (Batch, Cron, MapReduce, Spark) / Services / App Monitoring / Alert Center:** `Configure` → **"+"** → the tile (Data or Monitoring section).
- **Toggle hibernation:** **Workspace Settings** → **Settings** tab → **Hibernation** toggle. Editable only by **workspace/application/C3 Code admins**; others see it disabled.
- **Deploy the app:** **Deploy** in the workspace header (⋯/Settings menu on small screens). No need to "sync" first — C3 Code auto-syncs. The button is **greyed out** for several reasons, each with its own tooltip:
  - Not an **application admin** — *"Application admin access is required to deploy from this workspace."*
  - The workspace **isn't running** (or the environment reference is invalid).
  - **Continuous deployment is configured** for the app — *"Manual deployment is disabled because continuous deployment is configured for this application"* (this hits even an app-admin on a running workspace).
  - A **chat query is still running** — *"Please wait for the pending query to complete before deploying."*
- **Share the workspace:** **Share** in the workspace header. Disabled unless you are an **admin** on a **running** workspace (tooltip *"Admin access is required to share this workspace"*).
- **Change the coding harness (Agent Backend):** **Workspace Settings** → **Settings** → enable **advanced mode** (**Cmd+I** / **Ctrl+I**) → expand **Advanced Settings** → pick a backend under **Agent Backend** (OpenCode / Claude / Codex). If the workspace is **running**, this **restarts it** (confirm **Restart & Apply**); if stopped, it applies immediately. Buttons are disabled in transient states.
- **Manage collaborators / give a teammate access to this workspace:** **Workspace Settings** → **Collaborators** tab, then add them as a user or admin. (This is workspace membership, not app-level roles/ACLs — that's `c3-access-control`.)
- **Connect Git:** **Home → Settings** (bottom-left) → connect a Git provider, then back in the workspace use the header **Git** dropdown to finish. The Git dropdown needs **application-admin** access **and** a **running** workspace, else it's disabled.
- **Add an MCP server (for the coding agent):** **Home → Settings** → add it, then **restart the workspace**. Applies to **all** your workspaces. (The launcher's **MCP** section instead configures the *application's* MCP for its agents.)
- **Download / export a chat session:** in the **chat panel** header, click the **⋯ (Chat actions)** button → **Download chat session**. This saves the current session's messages as a **JSON** file.
- **Start / stop / restart:** **Start** and **Stop** (plus Rename/Delete) are in the workspace header **⋯/Settings menu**. There is **no dedicated Restart button** — Stop then Start. (Some flows auto-restart, e.g. changing the Agent Backend while running.) If a workspace is on an **older version of C3 Code**, an *out-of-date* banner appears with a **Stop workspace** button; stopping and starting it upgrades it to the latest version.

## Boundaries

- This is for **navigating C3 Code**. If the user wants to **build/change their app** (page, type, data, method), route to the coding skills.
- Labels are the shipped UI strings; if a build differs slightly, guide by section and purpose.
