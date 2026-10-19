# Starter kit

The code ships inline at `resources/agentix-chat-code/` — the consumer template and the vendored library sit
beside this skill file. Point your coding agent at `resources/agentix-chat-code/react/` along with
the prompt below. The agent reads this file (`SKILL.md` + `references/`) and wires the chat into
your app.

If your app is still on the **C3 Code / `nexusPkg`** template, delete its proxy and auth gate first —
see [Migrating an app off the C3 Code template](./migration-and-upgrade.md#migrating-an-app-off-the-c3-code-nexuspkg-template).

Runtime sign-in also needs cluster-side admin setup (mount discovery + `Agentix.User`) that this skill
does not perform — see [`prerequisites.md`](./prerequisites.md).

## What's in the kit

This skill directory contains the instructions and the code:

| Entry                          | What it is                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SKILL.md`                     | Skill instructions                                                                                                                                                                                                                                                                   |
| `references/`                  | Supporting references (this file included)                                                                                                                                                                                                                                           |
| `../agentix-agent-authoring/`  | Sibling skill: how to **author agents** over REST — create/configure an agent and author + attach skills, MCP connections, plugins, and tools by name. (In the downloadable `.tgz` it is injected under `references/agentix-agent-authoring/` so the download stays self-contained.) |
| `resources/agentix-chat-code/` | The code — the two directories below                                                                                                                                                                                                                                                 |

`resources/agentix-chat-code/` holds:

| Directory          | What it is                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `react/`           | A working consumer template app. `cd react && npm install && npm run build` is a build check — see below     |
| `agentix-chat-ui/` | The chat library (with a standalone `demo/` inside) the template builds against as `file:../agentix-chat-ui` |
| `content/`         | Pre-built assets (fonts, built JS/CSS)                                                                       |

## What to expect

- **The kit cannot run standalone on a laptop.** `npm install && npm run build` inside `react/` is a
  **build** check — it proves the kit is self-contained and compiles with no monorepo on disk.
  It cannot run the chat, which signs in by a **same-origin cookie exchange** against the Agentix mount
  (see [how it works](./how-it-works.md)). On `localhost` there is
  no C3 session and no same-origin mount, so the page renders and the chat never signs in. The chat
  runs from the **deployed** app, on the same cluster host as Agentix.
- **Each user's first message can take minutes** while that user's agent pod boots. Pods key on
  `userId` — one per user — and the embed shares that pod and its history with the Agentix host UI.
- **No locale or theme in the template.** It renders i18n keys as placeholders and stock Tailwind colors on
  purpose (step 4). The consuming app supplies both.
