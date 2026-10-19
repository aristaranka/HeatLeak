/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * `@c3/agentix-client-ui` — the shared Nexus chat UI for the host SPA and same-host embeds.
 *
 * - {@link ChatPage} — the full shared chat page cluster.
 * - {@link NexusChatTransport} — live-pod backend contract ChatPage is injected with.
 * - {@link InClusterTransport} — the one transport (cookie + NDJSON via the host chat API); host
 *   uses `{ local: true }`, embeds use `{ baseUrl }` after Microservice discovery.
 * - {@link NexusChatEmbed} — drop-in chat component for sibling apps (auth handled inside).
 */

export type { NexusChatTransport } from './transport';

export { InClusterTransport } from './transports/InClusterTransport';

// Same-host embed: drop-in chat component — silent cookie exchange inside, no consumer-visible
// auth. The helpers are exported for embeds that compose their own surface.
export { default as NexusChatEmbed } from './NexusChatEmbed';
export type { NexusChatEmbedProps } from './NexusChatEmbed';
export { hasNexusCookie, silentNexusCookieBootstrap } from './lib/nexusCookieBootstrap';
export {
  ownApiBase,
  pathnameFromServiceAppId,
  pathnameFromServiceAppUrl,
  resolveNexusMountPath,
} from './lib/resolveNexusMount';

// Theme: light/dark helpers + the pre-paint FOUC snippet (`themeInitScript`) a consumer inlines in
// `<head>` to stamp the persisted (light-default) theme before first paint. `initTheme` applies it
// at startup; `useTheme` is the runtime toggle. Chat itself defaults light with no setup — these are
// for consumers that also want to drive theme / avoid a pre-hydration flash.
export { THEME_STORAGE_KEY, themeInitScript, getStoredTheme, applyTheme, initTheme, useTheme } from './lib/theme';
export type { Theme } from './lib/theme';

// Shared chat UI. The ChatPage cluster lives in this package; the host mounts it inside its
// existing NavShell / SessionProvider route with an injected InClusterTransport.
export { default as ChatPage } from './pages/ChatPage';
export type { ChatPageProps } from './pages/ChatPage';

export { default as RichTextComposer, cleanMarkdown, plainToMarkdown } from './components/RichTextComposer';
export type { RichTextComposerHandle, RichTextComposerProps } from './components/RichTextComposer';

// Chat chrome shared with the host admin shell (AgentDetailPage / ChatDefaultsPanel reuse
// EffortControl for the same effort scale).
export { default as AgentPicker } from './components/AgentPicker';
export {
  default as EffortControl,
  DEFAULT_EFFORT,
  DEFAULT_EFFORT_LEVELS,
  clampToScale,
} from './components/EffortControl';
export { useAgentDefinitions } from './hooks/useAgentDefinitions';
export type { UseAgentDefinitionsOptions, UseAgentDefinitionsResult } from './hooks/useAgentDefinitions';
