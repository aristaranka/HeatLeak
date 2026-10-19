#!/usr/bin/env bash
#
# Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
# Confidential and Proprietary C3 Materials.
#
# install_embed.sh — deterministic, idempotent scaffolding for the
# STRUCTURE-INDEPENDENT parts of an embed-agentix-chat integration. It does ONLY
# what is safe to script for any consumer app, and deliberately leaves the
# per-app merges to the agent. Re-running is a no-op where nothing changed.
#
# DOES (the ~90%-confidence parts):
#   1. vendor the chat library as a sibling of the react app (ui/agentix-chat-ui)
#   2. copy the canonical viteShared.ts + the build-types stub
#   3. create src/i18n.ts (from the kit) and a src/pages/Chat/Chat.tsx wrapper
#   4. merge the library's deps into the consumer package.json — MISSING ONLY;
#      never downgrades or overwrites an existing pin; conflicts are LISTED for
#      the agent to reconcile. Pins @types/react(-dom) to the app's React major.
#   5. append the .gitignore negations for the vendored src/lib
#
# DOES NOT (the per-app merges — printed as a checklist at the end):
#   - vite.config.mts  (singleton pin + optimizeDeps + fs.allow, keep the app's
#                        proxy/eslint/build)
#   - main.tsx         (add only the providers the app is missing)
#   - react-router-dom -> react-router import rewrite
#   - the /chat route and the nav item
#   - globals.css tailwind-sources + typography plugin
#
# Both the SOURCE kit and the DESTINATION ui dir are explicit arguments — the
# caller (the agent) provides them; nothing is derived from this script's own
# location, so the script works no matter where it or the kit has been copied.
#
# Usage:
#   install_embed.sh --kit <kit-dir> --ui <ui-dir> --agent-def-id <uuid> [--nexus-base <url>]
#     --kit <kit-dir>       SOURCE: the skill's `resources/agentix-chat-code` root
#                           (contains `agentix-chat-ui/` and `react/`). Pass the path
#                           where this skill's resources actually live in your
#                           workspace — do not assume a fixed location.
#     --ui <ui-dir>         DESTINATION: the app's `ui/` directory (contains `react/`);
#                           the library is vendored as its sibling `agentix-chat-ui/`.
#     --agent-def-id <uuid> the agent definition UUID the Chat page pins to.
#     --nexus-base <url>    optional urlOnly mount base (e.g. https://host/env/app/nexus/);
#                           omit for a serviceAppId/serviceAppUrl discovery mount.
#
# Exit 0 = the scriptable parts landed (see the checklist for what's left).
# Exit 1 = a precondition failed (bad paths, missing kit, unparseable package.json).

set -euo pipefail

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$*"; }
skip() { printf '  \033[33mSKIP\033[0m  %s\n' "$*"; }
die()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*" >&2; exit 1; }

USAGE='usage: install_embed.sh --kit <kit-dir> --ui <ui-dir> --agent-def-id <uuid> [--nexus-base <url>]'

# Only used to point at the co-located verify_embed.sh sibling in the closing
# checklist — NOT to locate the kit (that is the --kit argument's job).
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

KIT="" UI="" AGENT_DEF_ID="" NEXUS_BASE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --kit)           KIT="${2:-}"; shift 2 ;;
    --ui)            UI="${2:-}"; shift 2 ;;
    --agent-def-id)  AGENT_DEF_ID="${2:-}"; shift 2 ;;
    --nexus-base)    NEXUS_BASE="${2:-}"; shift 2 ;;
    -h|--help)       say "$USAGE"; exit 0 ;;
    *)               die "unknown argument '$1'
$USAGE" ;;
  esac
done

[ -n "$KIT" ]          || die "--kit is required (the skill's resources/agentix-chat-code root)
$USAGE"
[ -n "$UI" ]           || die "--ui is required (the app's ui/ dir)
$USAGE"
[ -n "$AGENT_DEF_ID" ] || die "--agent-def-id is required (the agent definition UUID)
$USAGE"

KIT="${KIT%/}"
UI="${UI%/}"
LIB_SRC="$KIT/agentix-chat-ui"
REACT_KIT="$KIT/react"

REACT="$UI/react"
LIB_DST="$UI/agentix-chat-ui"

[ -d "$KIT" ]        || die "kit dir not found: '$KIT'"
[ -d "$LIB_SRC" ]    || die "kit is missing 'agentix-chat-ui/' at '$LIB_SRC' — pass the resources/agentix-chat-code root as --kit"
[ -d "$REACT_KIT" ]  || die "kit is missing 'react/' at '$REACT_KIT' — pass the resources/agentix-chat-code root as --kit"
[ -d "$REACT" ]      || die "no react app at '$REACT' (pass the app's ui/ dir as --ui)"
[ -f "$REACT/package.json" ] || die "no package.json at '$REACT/package.json'"
command -v node >/dev/null 2>&1 || die "node is required for the package.json merge"

say "== embed-agentix-chat install (scriptable parts) =="
say "kit (src):  $KIT"
say "ui (dst):   $UI"
say "agentDefId: $AGENT_DEF_ID"
say "nexusBase:  ${NEXUS_BASE:-<none, discovery mount>}"

LICENSE='/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */'

# 1. Vendor the library (refresh: it is canonical and must never be hand-patched).
step "1. Vendor the chat library -> $LIB_DST"
rm -rf "$LIB_DST"
cp -r "$LIB_SRC" "$LIB_DST"
rm -rf "$LIB_DST/node_modules" "$LIB_DST/dist" "$LIB_DST/dist-embed-css" "$LIB_DST/coverage"
ok "vendored (node_modules/dist stripped)"

# 2. Canonical viteShared.ts + build-types stub.
step "2. Copy viteShared.ts + build-types stub"
cp "$REACT_KIT/viteShared.ts" "$REACT/viteShared.ts"
ok "viteShared.ts (canonical copy)"
mkdir -p "$REACT/build-types"
if [ -f "$REACT/build-types/vendored-library.d.ts" ]; then
  skip "build-types/vendored-library.d.ts already present"
else
  cp "$REACT_KIT/build-types/vendored-library.d.ts" "$REACT/build-types/vendored-library.d.ts"
  ok "build-types/vendored-library.d.ts"
fi

# 3. New files: i18n.ts (from kit) + the Chat page wrapper.
step "3. Create i18n.ts + Chat page (new files, skipped if present)"
if [ -f "$REACT/src/i18n.ts" ]; then
  skip "src/i18n.ts already present"
else
  cp "$REACT_KIT/src/i18n.ts" "$REACT/src/i18n.ts"
  ok "src/i18n.ts"
fi

CHAT="$REACT/src/pages/Chat/Chat.tsx"
if [ -f "$CHAT" ]; then
  skip "src/pages/Chat/Chat.tsx already present"
else
  mkdir -p "$(dirname "$CHAT")"
  if [ -n "$NEXUS_BASE" ]; then
    PROPS="agentDefId=\"$AGENT_DEF_ID\" nexusBase=\"$NEXUS_BASE\""
  else
    PROPS="agentDefId=\"$AGENT_DEF_ID\""
  fi
  {
    printf '%s\n\n' "$LICENSE"
    printf "import { NexusChatEmbed } from '@c3/agentix-client-ui';\n\n"
    printf 'export default function Chat() {\n'
    printf '  return (\n'
    printf '    <div style={{ height: "100%%", minHeight: 0 }}>\n'
    printf '      <NexusChatEmbed %s />\n' "$PROPS"
    printf '    </div>\n'
    printf '  );\n'
    printf '}\n'
  } > "$CHAT"
  ok "src/pages/Chat/Chat.tsx (pinned to $AGENT_DEF_ID)"
fi

# 4. Merge the library's deps into the consumer package.json (missing only).
step "4. Merge library deps into package.json (missing only; conflicts listed)"
CONFLICTS="$(LIB_PKG="$LIB_DST/package.json" node - "$REACT/package.json" <<'NODE'
const fs = require('fs');
const consumerPath = process.argv[2];
const libPath = process.env.LIB_PKG;
const consumer = JSON.parse(fs.readFileSync(consumerPath, 'utf8'));
const lib = JSON.parse(fs.readFileSync(libPath, 'utf8'));
consumer.dependencies = consumer.dependencies || {};
const dev = consumer.devDependencies || {};
const conflicts = [];

// The library itself, as a file: dep on the sibling vendored copy.
consumer.dependencies['@c3/agentix-client-ui'] = 'file:../agentix-chat-ui';

// Add each library dep that the consumer lacks; list (never change) conflicts.
for (const [name, want] of Object.entries(lib.dependencies || {})) {
  const have = consumer.dependencies[name] || dev[name];
  if (!have) {
    consumer.dependencies[name] = want;
  } else if (have !== want) {
    conflicts.push(`${name}: app has ${have}, library wants ${want}`);
  }
}

// Pin @types/react(-dom) to the consumer's React major (18 -> ~18.3.0, 19 -> ~19.0.0).
const reactRange = consumer.dependencies.react || '';
const major = (reactRange.match(/(\d+)/) || [])[1];
if (major === '18' || major === '19') {
  const pin = major === '18' ? '~18.3.0' : '~19.0.0';
  consumer.devDependencies = consumer.devDependencies || {};
  const bucket = consumer.dependencies['@types/react'] ? consumer.dependencies : consumer.devDependencies;
  bucket['@types/react'] = pin;
  (consumer.dependencies['@types/react-dom'] ? consumer.dependencies : consumer.devDependencies)['@types/react-dom'] = pin;
}

fs.writeFileSync(consumerPath, JSON.stringify(consumer, null, 2) + '\n');
process.stdout.write(conflicts.join('\n'));
NODE
)"
ok "library file: dep + missing deps added; @types/react pinned to React major"
if [ -n "$CONFLICTS" ]; then
  say "  version conflicts to reconcile by hand (app pin kept, NOT changed):"
  printf '%s\n' "$CONFLICTS" | sed 's/^/      /'
fi

# 5. .gitignore negations for the vendored src/lib (append at END; last match wins).
step "5. .gitignore negations for the vendored src/lib"
ROOT="$(git -C "$UI" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  skip "not in a git work tree — skipping .gitignore guard (add negations by hand if lib/ is ignored)"
else
  GI="$ROOT/.gitignore"
  if [ -f "$GI" ] && grep -q 'ui/agentix-chat-ui/src/lib/' "$GI"; then
    skip ".gitignore already has the src/lib negations"
  else
    {
      printf '\n# Vendored Agentix chat library ships its own src/lib/ (utils, cn); the repo-root\n'
      printf '# lib/ ignore rule would otherwise drop it and break the embed build. Last match wins,\n'
      printf '# so these negations must stay at the END of this file.\n'
      printf '!**/ui/agentix-chat-ui/src/lib/\n'
      printf '!**/ui/agentix-chat-ui/src/lib/**\n'
    } >> "$GI"
    ok "appended src/lib negations to $GI"
  fi
fi

# 6. Brownfield delta report — the per-app facts the agent otherwise greps by hand.
#    Everything here is READ-ONLY; it just tells you what the merges below must cover.
step "6. Brownfield delta report (read before the merges)"
SRC="$REACT/src"
if [ ! -d "$SRC" ]; then
  skip "no $SRC — skipping delta report"
else
  # react-router-dom import sites -> the exact rewrite list for TODO 3.
  RRD="$(grep -rlE "from ['\"]react-router-dom['\"]" "$SRC" 2>/dev/null | sed "s#^$REACT/##" || true)"
  if [ -n "$RRD" ]; then
    say "  react-router-dom -> react-router: rewrite these files:"
    printf '%s\n' "$RRD" | sed 's/^/      /'
  else
    say "  react-router-dom: none found (fresh app, or already on react-router)"
  fi
  # HashRouter (delta A).
  if grep -rqE "HashRouter" "$SRC" 2>/dev/null; then
    say "  router: HashRouter already used — delta A satisfied"
  else
    say "  router: no HashRouter — switch the app Router to HashRouter (delta A)"
  fi
  # Provider-tree primitives (check 7).
  for prim in tooltip sonner; do
    if [ -f "$SRC/components/ui/$prim.tsx" ]; then
      say "  components/ui/$prim.tsx: present"
    else
      say "  components/ui/$prim.tsx: MISSING — create it (mandatory provider tree, TODO 2)"
    fi
  done
  # Host dark-mode mechanism -> the theme-mirror decision (TODO 2).
  GLOBALS="$(find "$SRC" -maxdepth 2 -name 'globals.css' 2>/dev/null | head -1 || true)"
  if [ -z "$GLOBALS" ]; then
    say "  host theme: no globals.css found — confirm how the app toggles dark, then mirror into data-theme"
  elif grep -qE 'data-theme' "$GLOBALS" 2>/dev/null; then
    say "  host theme: globals.css uses data-theme — matches the embed (no mirror needed)"
  elif grep -qE '\.dark\b' "$GLOBALS" 2>/dev/null; then
    say "  host theme: globals.css is class-based (.dark) — MIRROR host theme into <html data-theme> (TODO 2)"
  else
    say "  host theme: mechanism unclear in globals.css — verify and mirror into data-theme (TODO 2)"
  fi
fi

cat <<EOF

== STILL TODO (per-app merges — do these by hand, then verify) ==
  1. vite.config.mts — add the singleton pin (makePinSingletons + dedupe SINGLETON_LIBS),
     the @/ alias legs [APP_SRC, CLIENT_SRC], optimizeDeps {exclude:['react-router','sonner'],
     include:['react-router > cookie','react-router > set-cookie-parser']}, and
     server.fs.allow ['.', '../agentix-chat-ui']. KEEP the app's existing proxy/eslint/build.
     PIN SINGLETONS VIA makePinSingletons ONLY — never a hand-written resolve.alias
     mapping singletons to directory paths: that triggers an inescapable
     dist/esm/<pkg>.js ENOENT dep-optimizer loop no cache-clear can fix. Easiest and
     safest is to copy the kit's vite.config.mts + viteShared.ts verbatim.
  2. main.tsx — the full provider tree is MANDATORY, not optional: QueryClientProvider (reuse
     the consumer's if it has one), TooltipProvider, AND <Toaster/> must all wrap the app.
     ChatPage renders tooltips/toasts only AFTER auth, so a dropped provider is invisible on
     plain-HTTP localhost and blanks the deployed chat. If the consumer lacks
     components/ui/sonner.tsx, CREATE it (wired to the app's own useTheme) -- do not skip Toaster.
     Import providers via '@/components/ui/*', not the package subpath. (verify_embed.sh check 7.)
     THEME: the chat themes off <html data-theme='dark'> only. If the host toggles dark by any
     other means (a .dark class / its own state), MIRROR it -- set document.documentElement.
     dataset.theme to match the host and keep it synced on toggle. The kit's initTheme() is for
     the STANDALONE chat and pins the embed to its own light default, so do NOT just call it in
     a host that owns the toggle, or the session sidebar renders light in the host's dark mode.
  3. Router — rewrite 'react-router-dom' -> 'react-router' in the app's source (v7 merged the
     DOM exports). Use HashRouter for the deployed mount.
  4. Route + nav — add the /chat route pointing at pages/Chat/Chat.tsx, and an "Assistant" nav item.
  5. globals.css — add: @import '@c3/agentix-client-ui/tailwind-sources.css'; @plugin '@tailwindcss/typography';
  6. Reconcile any dep conflicts listed above, then:
       cd $REACT && npm install
       VITE_C3_PKG=<pkg> npm run build
       bash $SELF_DIR/verify_embed.sh $UI
     Then load the app once and read the DEV-SERVER LOG (not just the console),
     checking timestamps against your last cache-clear (see the Preview stop rule).
EOF
