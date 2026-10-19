#!/usr/bin/env bash
#
# Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
# Confidential and Proprietary C3 Materials.
#
# verify_embed.sh — deterministic post-wiring checks for an embed-agentix-chat
# consumer. Replaces the checks the SKILL.md otherwise asks you to run by hand,
# so "did the wiring land" has one command and a clear pass/fail:
#
#   1. Library freshness — does NexusChatEmbed accept a `nexusBase` prop? (A
#      missing prop means the vendored library predates the current contract.)
#   2. .gitignore guard  — the vendored library's src/lib/ and src/styles/embed.css
#      must NOT be ignored, or you get the green-locally / red-in-CI surprise.
#   3. Built-CSS grep    — the package-only utilities (max-w-lg / state=open /
#      animate-in) must appear in the emitted CSS, or the presentation layer
#      leaked back to the host tree and the chat renders styleless (jsdom-invisible).
#   4. Singleton pinning — vite.config.mts uses makePinSingletons, NOT a hand-rolled
#      directory alias for the singletons (that alias causes the inescapable
#      dist/esm/<pkg>.js ENOENT dep-optimizer loop no cache-clear can fix).
#   5. Dep-optimizer escapes — exclude ['react-router','sonner'] + include the
#      react-router > cookie / set-cookie-parser pair (+ fs.allow the sibling lib);
#      each missing one maps to a documented dev-server blank/loop.
#   6. Provider imports — main.tsx imports providers from '@/components/ui/*', not
#      the '@c3/agentix-client-ui/...' subpath (delta B stubs the package, so a
#      subpath import fails tsc as "not a module").
#   7. Provider tree complete — main.tsx actually mounts TooltipProvider AND a
#      Toaster. ChatPage renders its Radix tooltips / sonner toasts only AFTER
#      Agentix auth succeeds, so a missing provider is INVISIBLE on plain-HTTP
#      localhost (the "Agentix is unavailable" placeholder never touches them) and
#      blanks the deployed HTTPS chat with a render crash. This gate is the only
#      way to catch it before the user does.
#   8. Cookie hoist collision — brownfield only. When a NESTED react-router cookie
#      exists (a top-level `cookie` from another dep out-hoisted react-router@7's),
#      the check-5 `react-router > cookie` include optimizes the wrong copy and the
#      app blanks with the same "does not provide an export named 'parse'" while
#      checks 1-7 pass. The current kit vite.config.mts self-guards this (fs.existsSync
#      → bare-`cookie` alias), so a verbatim kit copy passes; a fail flags a stale
#      pre-guard vite.config (or a pnpm layout the guard does not match).
#
# Usage:
#   verify_embed.sh <consumer-ui-dir>
#     <consumer-ui-dir>  a directory that contains the consumer `react/` app and
#                        the vendored `agentix-chat-ui/` library (e.g. the app's `ui/`).
#
# Exit 0 = all hard checks passed (a missing built CSS is a WARN, not a failure —
# run the build first). Exit 1 = at least one hard check failed.

set -euo pipefail

DIR="${1:-.}"
fail=0
warn=0

say()  { printf '%s\n' "$*"; }
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; fail=1; }
note() { printf '  \033[33mWARN\033[0m  %s\n' "$*"; warn=1; }

if [ ! -d "$DIR" ]; then
  say "verify_embed: '$DIR' is not a directory"; exit 1
fi

# Locate the vendored library (dir named agentix-chat-ui, or the pre-rename nexus-client-ui).
LIB="$(find "$DIR" -maxdepth 3 -type d \( -name agentix-chat-ui -o -name nexus-client-ui \) 2>/dev/null | head -1 || true)"

say "== embed-agentix-chat verify =="
say "dir: $DIR"
say ""

say "1. Library freshness (NexusChatEmbed accepts a nexusBase prop)"
if [ -z "$LIB" ]; then
  note "no vendored agentix-chat-ui/ found under $DIR — skipping freshness check"
else
  say "   library: $LIB"
  if grep -rqE 'nexusBase' "$LIB/src/NexusChatEmbed.tsx" 2>/dev/null \
     || grep -rqE 'nexusBase' "$LIB"/*.d.ts "$LIB"/**/*.d.ts 2>/dev/null; then
    pass "nexusBase prop present — library is current"
  else
    bad "nexusBase prop NOT found — vendored library is stale; refresh it from a current kit"
  fi
fi
say ""

say "2. .gitignore guard (vendored src/lib + styles/embed.css not ignored)"
if [ -z "$LIB" ]; then
  note "no vendored library — skipping .gitignore guard"
elif ! git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1; then
  note "not inside a git work tree — skipping .gitignore guard"
else
  ignored="$(git -C "$DIR" status --ignored --short "$LIB" 2>/dev/null | grep '^!!' || true)"
  if [ -n "$ignored" ]; then
    bad "these vendored paths are git-ignored (append negations at the END of root .gitignore):"
    printf '%s\n' "$ignored" | sed 's/^/        /'
  else
    pass "no vendored paths are ignored"
  fi
fi
say ""

say "3. Built-CSS grep (package-only utilities present in emitted CSS)"
# Search $DIR AND its parent: a brownfield consumer's vite outDir is often a
# SIBLING of the react root (e.g. `ui/react` builds to `ui/content/<pkg>`), so
# `../content` sits outside $DIR when the script is run from the react app dir.
CSS_ROOTS="$DIR"
[ -d "$DIR/.." ] && CSS_ROOTS="$DIR $DIR/.."
# shellcheck disable=SC2086
CSS="$(find $CSS_ROOTS -type f -name '*.css' -not -path '*/node_modules/*' \( -path '*/content/*' -o -path '*/dist/*' -o -path '*/assets/*' \) 2>/dev/null | head -1 || true)"
if [ -z "$CSS" ]; then
  note "no built CSS found (content/**, dist/**, assets/** under $DIR or its parent) — run the build first, then re-run"
else
  say "   css: $CSS"
  missing=""
  for tok in 'max-w-lg' 'state=open' 'animate-in'; do
    grep -qF "$tok" "$CSS" || missing="$missing $tok"
  done
  if [ -z "$missing" ]; then
    pass "all package-only utilities present — presentation layer landed"
  else
    bad "missing from built CSS:$missing — something styled leaked to the host tree, or tailwind-sources.css no longer covers it"
  fi
fi
say ""

say "4. Singleton pinning uses makePinSingletons (not a hand-rolled directory alias)"
# The #1 hand-merge trap: aliasing singletons (lucide-react, react-router, ...) to
# absolute DIRECTORY paths via resolve.alias. The dep-optimizer then guesses the ESM
# entry's extension from the CJS path (dist/esm/<pkg>.js) and ENOENTs when the real
# file is .mjs — an inescapable re-optimize loop that NO cache-clear or
# optimizeDeps.exclude fixes (see references/stall-preventers.md exit condition).
# makePinSingletons avoids it by delegating to this.resolve() (a fully-resolved file).
VITE="$(find "$DIR" -maxdepth 3 -type f -name 'vite.config.mts' -not -path '*/node_modules/*' -not -path '*/agentix-chat-ui/*' 2>/dev/null | head -1 || true)"
if [ -z "$VITE" ]; then
  note "no consumer vite.config.mts found under $DIR — skipping singleton-pin check"
else
  say "   vite: $VITE"
  if grep -q 'makePinSingletons' "$VITE"; then
    pass "makePinSingletons present — singletons resolve to real files"
  else
    bad "makePinSingletons NOT found in vite.config.mts — if singletons are hand-aliased to directory paths you will hit the inescapable dist/esm/<pkg>.js ENOENT loop. Re-copy the kit's vite.config.mts + viteShared.ts verbatim (do not hand-alias singletons)."
  fi
fi
say ""

say "5. Dep-optimizer escapes present in vite.config.mts"
# Three documented dev-server failures, each from a MISSING escape a brownfield
# hand-merge tends to drop:
#   - react-router / sonner not excluded -> ENOENT react-router/dist/index.js loop,
#     or esbuild "Unterminated string literal" on sonner's inlined CSS.
#   - the cookie/set-cookie-parser include missing -> blank app, "does not provide
#     an export named 'parse'" (excluding react-router un-bundles its CJS deps).
#   - fs.allow missing the sibling lib -> woff2 "outside Vite serving allow list".
if [ -z "$VITE" ]; then
  note "no consumer vite.config.mts found — skipping dep-optimizer escapes check"
else
  # Token-presence, not exact structure — tolerant of quote style, spacing, and
  # multi-line arrays. `sonner` (exclude) and `set-cookie-parser` (include) are
  # distinctive enough that their presence reliably means the escapes were copied;
  # react-router isn't checked (it also appears in manualChunks, so it's not a
  # distinctive signal).
  miss=""
  grep -q 'optimizeDeps' "$VITE"      || miss="$miss optimizeDeps"
  grep -q 'sonner' "$VITE"            || miss="$miss sonner(exclude)"
  grep -q 'set-cookie-parser' "$VITE" || miss="$miss set-cookie-parser(include)"
  if [ -z "$miss" ]; then
    pass "optimizeDeps escapes present (react-router/sonner exclude + cookie include)"
  else
    bad "vite.config.mts looks to be missing dep-optimizer escapes:$miss — each maps to a documented dev-server blank/loop. Copy the kit's optimizeDeps block verbatim."
  fi
  grep -q 'agentix-chat-ui' "$VITE" || note "server.fs.allow may not include the sibling '../agentix-chat-ui' — dev-served library assets (Geist woff2) will 403"
fi
say ""

say "6. Providers imported via @/ (not the @c3/agentix-client-ui subpath)"
# The subpath-import trap: importing providers from '@c3/agentix-client-ui/components/...'
# instead of the consumer's own '@/components/ui/*'. delta B stubs the whole package
# as one module decl, so TS rejects a subpath import as "not a module" -> build-config
# rabbit hole. The package root import (NexusChatEmbed) is fine; only a trailing-slash
# SUBPATH is the trap.
MAIN="$(find "$DIR" -maxdepth 4 -type f -name 'main.tsx' -not -path '*/node_modules/*' -not -path '*/agentix-chat-ui/*' 2>/dev/null | head -1 || true)"
if [ -z "$MAIN" ]; then
  note "no consumer main.tsx found — skipping provider-import check"
else
  say "   main: $MAIN"
  bad_imports="$(grep -nE "from ['\"]@c3/agentix-client-ui/" "$MAIN" || true)"
  if [ -z "$bad_imports" ]; then
    pass "no @c3/agentix-client-ui subpath imports in main.tsx"
  else
    bad "main.tsx imports a provider via the @c3/agentix-client-ui SUBPATH (TS will reject it as 'not a module'). Import providers from '@/components/ui/*' instead:"
    printf '%s\n' "$bad_imports" | sed 's/^/        /'
  fi
fi
say ""

say "7. Provider tree complete (TooltipProvider + Toaster mounted in main.tsx)"
# The template's main.tsx wraps the app in TooltipProvider and renders <Toaster/>.
# ChatPage uses Radix tooltips + sonner toasts INTERNALLY and only renders after
# Agentix auth succeeds -- which never happens on plain-HTTP localhost, so the
# missing-provider crash is invisible in a localhost smoke check and only blanks
# the deployed HTTPS chat. Structural presence is the only reliable signal. A
# consumer with a different design system that legitimately lacks sonner must
# still create components/ui/sonner.tsx and mount it -- not drop the provider.
if [ -z "$MAIN" ]; then
  note "no consumer main.tsx found — skipping provider-tree check"
else
  pmiss=""
  grep -q 'TooltipProvider' "$MAIN" || pmiss="$pmiss TooltipProvider"
  grep -q 'Toaster' "$MAIN"         || pmiss="$pmiss Toaster"
  if [ -z "$pmiss" ]; then
    pass "TooltipProvider + Toaster present — post-auth ChatPage tree will mount"
  else
    bad "main.tsx is missing:$pmiss — ChatPage renders tooltips/toasts only AFTER auth, so this is INVISIBLE on localhost and blanks the deployed chat. Add both (create components/ui/sonner.tsx if the consumer lacks it); import via '@/components/ui/*'."
  fi
fi
say ""

say "8. react-router cookie hoist collision (brownfield-only)"
# The greenfield include `optimizeDeps.include: ['react-router > cookie']` (check 5)
# optimizes whichever `cookie` WON the npm hoist. In a brownfield app another dep
# (e.g. express via @modelcontextprotocol/sdk) can pull a top-level `cookie` that
# out-hoists react-router@7's required cookie@1.x, forcing npm to NEST react-router's
# own copy at react-router/node_modules/cookie. `react-router > cookie` then optimizes
# the WRONG (hoisted) copy, react-router's raw `import { parse } from 'cookie'` hits
# the un-interop'd nested CJS, and the app blanks with the SAME "does not provide an
# export named 'parse'" -- while checks 1-7 all pass. The presence of a NESTED
# react-router cookie is the deterministic signal that the greenfield include is
# insufficient. Fix: alias the bare `cookie` specifier to react-router's own copy and
# force-optimize bare `cookie` (not `react-router > cookie`). See troubleshooting.md.
NESTED_COOKIE="$(find "$DIR" -maxdepth 6 -type d -path '*/react-router/node_modules/cookie' -not -path '*/agentix-chat-ui/*' 2>/dev/null | head -1 || true)"
if [ -z "$NESTED_COOKIE" ]; then
  pass "no nested react-router cookie — greenfield topology, no hoist collision"
elif [ -z "$VITE" ]; then
  note "nested react-router cookie present ($NESTED_COOKIE) but no consumer vite.config.mts found — skipping collision check"
else
  # Collision topology present. The fix's signature is a BARE-`cookie` alias
  # (find: /^cookie$/ or find: 'cookie'). The current kit vite.config.mts ships this
  # alias behind a self-guarding fs.existsSync check, so a verbatim kit copy already
  # satisfies this — a fail here means a stale/pre-guard vite.config (or a pnpm layout
  # the guard's nested-path check does not match).
  if grep -qE "find:[[:space:]]*/\^cookie\\\$/" "$VITE" || grep -qE "find:[[:space:]]*['\"]cookie['\"]" "$VITE"; then
    pass "nested react-router cookie present, and vite.config pins bare 'cookie' to react-router's copy (auto-guard)"
  else
    bad "react-router's cookie is NESTED ($NESTED_COOKIE) — a top-level 'cookie' out-hoisted it, so the 'react-router > cookie' include optimizes the WRONG copy and the app blanks with \"does not provide an export named 'parse'\" DESPITE check 5 passing. Re-copy the current kit vite.config.mts (it auto-guards this via fs.existsSync), or alias the bare 'cookie' specifier to react-router's own nested copy and add bare 'cookie' to optimizeDeps.include. See references/troubleshooting.md."
  fi
fi
say ""

if [ "$fail" -ne 0 ]; then
  say "RESULT: FAIL (fix the items above)"; exit 1
elif [ "$warn" -ne 0 ]; then
  say "RESULT: PASS with warnings (see WARN lines)"; exit 0
else
  say "RESULT: PASS"; exit 0
fi
