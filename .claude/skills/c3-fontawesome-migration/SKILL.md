---
name: c3-fontawesome-migration
description: |
  Handle FontAwesome Pro npm install failures and icon library migration in C3 Code workspaces. Use when:
  (1) npm install fails with E401 or 403 for @fortawesome/pro-* packages
  (2) .npmrc references a FontAwesome Pro registry token that is rate-limited, invalid, or expired
  (3) the user wants to migrate from FontAwesome to Lucide or FontAwesome Free
core: false
category: tooling
version: 1.0.0
---

# FontAwesome Migration

Older C3 Code project templates shipped with FontAwesome Pro and an embedded auth token in `react/.npmrc`. That token may now be rate-limited or revoked. This skill handles the migration.

## When This Skill Triggers

- `npm install` fails with `E401` or `403` for `@fortawesome/pro-*` packages
- `.npmrc` contains a FontAwesome Pro registry token that is rate-limited or invalid
- The workspace was created from an older template that included FontAwesome Pro

## Step 1: Present Options to the User

When you detect a FontAwesome Pro authentication or rate-limit failure, present the user with three options:

> This project uses FontAwesome Pro icons, but the bundled auth token is no longer working (likely rate-limited). You have three options:
>
> 1. **Migrate to Lucide** (recommended) — replace all FontAwesome icons with `lucide-react`, the current standard for C3 Code projects
> 2. **Migrate to FontAwesome Free** — replace Pro icons with their closest Free equivalents (minimal code changes)
> 3. **Use your own FontAwesome Pro key** — if you have a personal FontAwesome Pro license
>
> Which would you prefer?

## Step 2: Execute the Chosen Option

### Option 1: Migrate to Lucide (Recommended)

1. In `package.json`:

   - Remove all `@fortawesome/*` packages
   - Add `"lucide-react": "^0.460.0"` (or latest) if not already present

2. In `react/.npmrc`, remove the FontAwesome Pro registry lines (the lines containing `npm.fontawesome.com`).

3. Replace all FontAwesome imports and usages across `.tsx`/`.ts` files:

   **Before:**

   ```tsx
   import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
   import { faEdit, faTrash, faPlus, faSearch } from '@fortawesome/free-solid-svg-icons';

   <FontAwesomeIcon icon={faEdit} />
   <FontAwesomeIcon icon={faTrash} className="text-danger" />
   ```

   **After:**

   ```tsx
   import { Pencil, Trash2, Plus, Search } from 'lucide-react';

   <Pencil className="w-4 h-4" />
   <Trash2 className="w-4 h-4 text-danger" />
   ```

4. Run `npm install`, then `npm run build` and fix any errors.

### Option 2: Migrate to FontAwesome Free

1. In `package.json`, replace Pro packages with Free equivalents:

   - `@fortawesome/pro-regular-svg-icons` -> `@fortawesome/free-regular-svg-icons`
   - `@fortawesome/pro-solid-svg-icons` -> `@fortawesome/free-solid-svg-icons`
   - Keep `@fortawesome/react-fontawesome` and `@fortawesome/fontawesome-svg-core`

2. In `react/.npmrc`, remove the FontAwesome Pro registry lines (the lines containing `npm.fontawesome.com`).

3. Search all `.tsx` and `.ts` files for Pro icon imports and replace with Free equivalents:

   - `@fortawesome/pro-regular-svg-icons` -> `@fortawesome/free-regular-svg-icons`
   - `@fortawesome/pro-solid-svg-icons` -> `@fortawesome/free-solid-svg-icons`

4. Some Pro icons have no Free equivalent. For those, find the closest Free alternative or switch to a Lucide icon.

5. Run `npm install`, then `npm run build` and fix any errors.

### Option 3: Use Your Own FontAwesome Pro Key

**CRITICAL: NEVER ask the user to paste the key into the chat.** Auth tokens are secrets.

The project already has a `react/.npmrc` file with a FontAwesome Pro registry configuration. The existing token is rate-limited or invalid. Instruct the user to replace it with their own:

> Your project already has a `react/.npmrc` with a FontAwesome Pro token that is no longer working. Please open `react/.npmrc` and replace the value after `_authToken=` with your own FontAwesome Pro token (from https://fontawesome.com/account). Do not paste the token in this chat — edit the file directly.
>
> Once you have saved the file, let me know and I will run `npm install` again.

After the user confirms, run `npm install` and verify the build passes.

## Notes

- Lucide icons use `className` for sizing and color (e.g., `className="w-4 h-4 text-primary"`), unlike FontAwesome which uses the `icon` prop.
- Lucide icons are tree-shakable — only imported icons are bundled.
