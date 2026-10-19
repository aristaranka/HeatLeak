#!/usr/bin/env bash
#
# Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
# Confidential and Proprietary C3 Materials.
#
# Publishability + consumer-portability acceptance for @c3/doc-ai-documents-ui.
#
# `npm pack`s the package, extracts the tarball into a throwaway directory (no repo tree on its
# path), and type-checks the extracted sources the way a real consumer would. Green = the package
# is self-contained AND alias-agnostic — i.e. it builds under any downstream tsconfig, not just this
# repo's. The consumer failure mode this pins:
#
#   A shipped source uses the `@/` path alias. The package ships raw TS, so a consumer resolves these
#   transitive imports against ITS OWN tsconfig `@/*` mapping, not ours — yielding a wall of TS2307
#   "Cannot find module '@/...'". Shipped `src/` must therefore be RELATIVE-ONLY. We pin this two
#   ways: a direct grep for any `@/` import specifier (step 2), and a standalone tsc run under a
#   tsconfig whose `@/*` maps to a DECOY dir (step 3) — reproducing a consumer whose alias points
#   elsewhere, so any stray `@/` fails to resolve exactly as it would downstream.
#
# This is the build-level companion to the source-level packageBoundary guard
# (src/__tests__/packageBoundary.test.ts) and the package's own alias-free tsconfig / vite config.
#
# Portable across macOS-dev and Ubuntu-CI: no `stat`/`sed`/`date` forks; `mktemp -d` with no arg
# works on both BSD and GNU.

set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PKG_DIR"

if [[ ! -d node_modules ]]; then
  echo "ERROR: $PKG_DIR/node_modules missing — run 'npm ci' in the package first." >&2
  exit 1
fi

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "==> npm pack"
TGZ_NAME="$(npm pack --pack-destination "$WORK" 2>/dev/null | tail -1)"
TGZ="$WORK/$TGZ_NAME"
[[ -f "$TGZ" ]] || { echo "ERROR: pack produced no tarball" >&2; exit 1; }

echo "==> extract to isolated tree (no repo tree on this path)"
ISO="$WORK/iso"
mkdir -p "$ISO"
tar xzf "$TGZ" -C "$ISO"          # -> $ISO/package/{src,package.json,...}
EXT="$ISO/package"

# 1. Structural: the tarball must ship no test files and no __tests__/__mocks__ dirs.
test_files="$(find "$EXT/src" \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l | tr -d ' ')"
[[ "$test_files" == "0" ]] || { echo "ERROR: tarball ships $test_files test file(s)" >&2; find "$EXT/src" \( -name '*.test.ts' -o -name '*.test.tsx' \) >&2; exit 1; }
test_dirs="$(find "$EXT/src" -type d \( -name '__tests__' -o -name '__mocks__' \) | wc -l | tr -d ' ')"
[[ "$test_dirs" == "0" ]] || { echo "ERROR: tarball ships $test_dirs test dir(s)" >&2; find "$EXT/src" -type d \( -name '__tests__' -o -name '__mocks__' \) >&2; exit 1; }

# 2. Alias-level: no source may import via the `@/` path alias. A consumer resolves these against its
#    own tsconfig `@/*`, not ours. Match keyword-anchored specifiers — `from '@/…'`, `import('@/…')`,
#    `require('@/…')`, and the bare side-effect `import '@/…'` (a CSS import has no `from`) — so a
#    `@/` mention inside a comment or JSDoc is ignored.
alias_imports="$(grep -rnE "(from|import\(|require\()[[:space:]]*['\"]@/|import[[:space:]]+['\"]@/" "$EXT/src" || true)"
if [[ -n "$alias_imports" ]]; then
  echo "ERROR: tarball sources use the '@/' path alias — rewrite these relative (a consumer's @/* maps elsewhere):" >&2
  echo "$alias_imports" >&2
  exit 1
fi

# 3. Build-level: type-check standalone the way a downstream consumer does. The tarball omits
#    tsconfig (files: ["src"]); supply the package's own config + its installed deps. Then layer a
#    consumer tsconfig that maps `@/*` to a DECOY dir with none of our modules: relative-only src
#    ignores it and type-checks clean, while any stray `@/` import fails to resolve here exactly as it
#    would in a real consumer. react/react-dom pins mirror the package tsconfig (tsconfig `paths` is
#    replaced, not merged, by `extends`) so the standalone tree still resolves a single react types copy.
#    `types` is narrowed to ["node"] here: shipped src/ must not depend on any ambient types beyond
#    node + react (no stray `/// <reference types="jest" />` etc.), so a reintroduced ambient dep is
#    caught here rather than masked by the in-repo tsconfig's wider `types`.
cp "$PKG_DIR/tsconfig.json" "$EXT/tsconfig.json"
ln -s "$PKG_DIR/node_modules" "$EXT/node_modules"
mkdir -p "$EXT/__decoy_consumer_alias__"
cat > "$EXT/tsconfig.consumer.json" <<'JSON'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "types": ["node"],
    "paths": {
      "@/*": ["./__decoy_consumer_alias__/*"],
      "react": ["./node_modules/@types/react"],
      "react/*": ["./node_modules/@types/react/*"],
      "react-dom": ["./node_modules/@types/react-dom"],
      "react-dom/*": ["./node_modules/@types/react-dom/*"]
    }
  },
  "include": ["src"],
  "exclude": ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/__mocks__/**"]
}
JSON

echo "==> isolated tsc under a foreign '@/*' mapping (consumer alias reproduced)"
( cd "$EXT" && npx --no-install tsc --noEmit -p tsconfig.consumer.json )

# 4. Consumer smoke: a host file that imports the curated public API by the package name and mounts
#    the Documents page must type-check. Maps the package name to the extracted src (as `npm install`
#    would via `main`/`exports` → src/index.ts), proving named-export consumption end to end.
mkdir -p "$EXT/__host_consumer__"
cat > "$EXT/__host_consumer__/host.tsx" <<'TSX'
import React from 'react';
import { DocumentsPage, DataPage, initDocAiI18n, computeGenAiRoleFlags, fetchSourceFiles } from '@c3/doc-ai-documents-ui';

initDocAiI18n();
void fetchSourceFiles;
void computeGenAiRoleFlags([]);
export const HostApp: React.FC = () => (
  <div>
    <DocumentsPage />
    <DataPage />
  </div>
);
TSX
cat > "$EXT/tsconfig.host.json" <<'JSON'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "types": ["node"],
    "paths": {
      "@c3/doc-ai-documents-ui": ["./src/index.ts"],
      "@c3/doc-ai-documents-ui/*": ["./src/*"],
      "react": ["./node_modules/@types/react"],
      "react/*": ["./node_modules/@types/react/*"],
      "react-dom": ["./node_modules/@types/react-dom"],
      "react-dom/*": ["./node_modules/@types/react-dom/*"]
    }
  },
  "include": ["src", "__host_consumer__"],
  "exclude": ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/__mocks__/**"]
}
JSON

echo "==> host consumer tsc (import the package by name, mount DocumentsPage)"
( cd "$EXT" && npx --no-install tsc --noEmit -p tsconfig.host.json )

echo "PASS: @c3/doc-ai-documents-ui packs and type-checks standalone under a foreign alias — self-contained, alias-agnostic, publishable."
