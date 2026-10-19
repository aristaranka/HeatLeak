/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

function importMetaEnvPlugin({ types: t }) {
  return {
    name: 'transform-import-meta-env',
    visitor: {
      MemberExpression(path) {
        if (
          path.node.object.type === 'MemberExpression' &&
          path.node.object.object.type === 'MetaProperty' &&
          path.node.object.object.meta.name === 'import' &&
          path.node.object.object.property.name === 'meta' &&
          path.node.object.property.name === 'env'
        ) {
          const envName = path.node.property.name;
          const envValues = {
            MODE: 'test',
            DEV: false,
            PROD: false,
            SSR: false,
            VITE_C3_AUTH_TOKEN: 'test-token',
            VITE_EDITOR_MODE: 'test',
            VITE_C3_UI_PREVIEW_IFRAME_PATH: 'http://localhost:3000/preview',
            VITE_C3_VSCODE_IFRAME_PATH: 'http://localhost:3000/vscode',
          };
          const value = envValues[envName];
          if (value !== undefined) {
            if (typeof value === 'string') {
              path.replaceWith(t.stringLiteral(value));
            } else if (typeof value === 'boolean') {
              path.replaceWith(t.booleanLiteral(value));
            }
          }
        }
      },
    },
  };
}

module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
  plugins: [],
  env: {
    test: {
      plugins: [importMetaEnvPlugin],
    },
  },
};
