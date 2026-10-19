/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * The repo-root config applies the TypeScript parser only under `src/`, so a `.ts` file in `scripts/` or `e2e/`
 * fails to parse. Node check scripts and the Playwright lane belong outside the app bundle, so give those
 * directories the parser and the Node globals they need. The package's own flat `eslint.config.js`, used by
 * `npm run lint`, ignores this file.
 */
module.exports = {
  overrides: [
    {
      files: ['scripts/*.ts'],
      parser: '@typescript-eslint/parser',
      env: { node: true },
    },
    {
      files: ['e2e/**/*.ts', 'playwright.config.ts'],
      parser: '@typescript-eslint/parser',
      env: { node: true },

      /** Test-only code, so `@playwright/test` is correctly a devDependency. */
      rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true }] },
    },
  ],
};
