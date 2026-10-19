/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * vitest setup for the embed demo's own suites (demo/src/demo). These tests mock
 * `@c3/agentix-client-ui` at the package seam, so they never mount the real ChatPage — no jsdom
 * globals (scrollIntoView / IntersectionObserver / ResizeObserver) or i18n bootstrap are needed,
 * unlike the full chat suite in c3/nexusClientTest/react. All this file adds is jest-dom's DOM
 * matchers (toBeInTheDocument / toHaveAttribute) that the demo route tests assert with.
 */

import '@testing-library/jest-dom/vitest';
