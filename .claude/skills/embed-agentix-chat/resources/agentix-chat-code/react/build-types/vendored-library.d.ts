/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * BUILD-ONLY module stubs for the vendored chat library.
 *
 * `tsconfig.build.json` remaps `@c3/agentix-client-ui[/*]` onto this file and drops the second
 * `@/*` path leg (which normally resolves `@/components/*`, `@/lib/*`, … into
 * `../agentix-chat-ui/src/*`). These bodyless `declare module` forms make the modules' type
 * `any`, so any named/default import the consumer makes from the vendored library resolves to
 * `any` — keeping the consumer's own `src/**` type-check honest (its JSX, hooks, and local
 * modules are still fully checked) while treating the vendored library as an opaque,
 * already-type-checked external dependency. This stops `tsc -p tsconfig.build.json` from pulling
 * the library's `.ts/.tsx` source (and its unresolvable bare imports) into the program.
 *
 * Runtime resolution of these imports is handled by vite (vite.config.mts), not by this stub,
 * and the editor/IDE (tsconfig.json) still resolves them to real library source for full
 * IntelliSense.
 */

declare module '@c3/agentix-client-ui';
declare module '@c3/agentix-client-ui/*';

/*
 * The consumer's `@/components/*`, `@/lib/*`, etc. imports normally resolve (via the second
 * `@/*` path leg) into the vendored library source. During the build type-check we drop that
 * leg so only `./src/*` is searched; anything the consumer imports under `@/` that it does not
 * own therefore falls through to this ambient stub instead of dragging library source in.
 */
declare module '@/*';
