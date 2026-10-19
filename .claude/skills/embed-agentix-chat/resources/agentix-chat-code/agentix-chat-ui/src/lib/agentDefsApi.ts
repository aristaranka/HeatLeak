/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * Chat-facing slice of the agent-definition API: the agent picker's paged definition list and the
 * model picker's available-models read. Both build on the shared transport core ({@link ./apiCore}),
 * so the package owns its request path with no reach into the host tree. The host admin surface
 * (create / edit / delete / import-export / skill assignment / LLM registry) stays in
 * `nexus/react/src/lib/agentsApi.ts` and re-imports these from here.
 */

import { c3call } from './apiCore';

const API_TYPE = 'Nexus.Agent.DefinitionApi';

export interface AgentDefinitionRow {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  llmModel?: string | null;
  llmEffort?: string | null;
  icon?: string | null;
  isProtected?: boolean;
  /** Per-agent read-only lock (admin-only). When true, chats from this agent run read-only against
   *  connected target apps. OR-combined with the app-wide config at chat creation. */
  readOnly?: boolean;
  /** Per-agent write-action allow list (whitelist). Layered UNDER read-only; empty = no allow
   *  restriction. Combined with the app-wide config by intersection of non-empty lists at chat
   *  creation. Admin-only. */
  writeActionAllowlist?: string[];
  /** Per-agent write-action deny list (blacklist). Layered UNDER read-only; deny beats allow.
   *  Combined with the app-wide config by union at chat creation. Admin-only. */
  writeActionDenylist?: string[];
  /** Per-agent skill-improvement participation (admin-only). When true, this agent's chats may be
   *  mined by the skill-improvement loop; ANDed with the deployment ceiling + the user's own mode.
   *  Default off (fail-closed). */
  skillImprovementEnabled?: boolean;
  /** Skill names (bundled or global) attached to this agent; resolved + frozen per session. */
  skillNames?: string[];
  /** Plugin names attached to this agent; resolved + frozen per session. */
  pluginNames?: string[];
  /** Global MCP connection keys attached to this agent; resolved per-user + frozen per session. */
  mcpConnectionKeys?: string[];
  /** Custom tool names this agent is entitled to; frozen per session. Repo-bundled code, name-only here. */
  customToolNames?: string[];
  /** Advisory marker: this definition is designed to run as a subagent. Purely descriptive — does
   *  not gate whether the definition CAN be launched as a subagent. */
  isSubagent?: boolean;
  /** Prose documentation of this agent's capabilities, for an orchestrating agent deciding whether
   *  and how to delegate to this definition as a subagent. */
  howToUse?: string | null;
  /** Ids/names of other `isSubagent` definitions this agent may launch via startSubagent. Empty
   *  means unrestricted (any subagent-eligible definition may be spawned). */
  subagentNames?: string[];
  /** CPU request in millicores when launched as a subagent. `null`/unset = no override (inherits
   *  the deployment default), bounded by the app-wide `hardwareCpuMillicoresMax` ceiling. */
  hardwareCpuMillicores?: number | null;
  /** Memory request in MiB when launched as a subagent. `null`/unset = no override, bounded by
   *  the app-wide `hardwareMemoryMbMax` ceiling. */
  hardwareMemoryMb?: number | null;
  /** Pod PVC size in GiB when launched as a subagent. `null`/unset = no override, bounded by the
   *  app-wide `hardwarePvcGbMax` ceiling. */
  hardwarePvcGb?: number | null;
  /** Named container image variant applied when launched as a subagent via `startSubagent`.
   *  `null`/unset = no override (inherits the deployment default image). Must resolve against the
   *  app-wide `Nexus.Agent.Service.Config#agentImageVariants`/`#agentImageVariantTags` allow-list —
   *  see `listAgentImageVariants` for the discoverable name set. */
  agentImageVariant?: string | null;
  appIds?: string[];
  /** This row's mutability class, carried on every `Nexus.Agent.DefinitionApi.list` / `forId` row so the
   *  agent list + picker can badge a downloaded snapshot. Absent reads as `local`. */
  origin?: 'local' | 'downloaded';
  /** Downloaded rows only: provenance of the snapshot (shared `Nexus.Origin.Source` block) — chiefly
   *  the source app it was promoted from, surfaced on the card + detail page. */
  source?: {
    /** Canonical app id (`<cluster>-<env>-<app>`) the snapshot was downloaded/promoted from. */
    appId?: string | null;
    /** The agent's name in the source app. */
    originalName?: string | null;
    /** Publish fingerprint (version identity) of the source snapshot. */
    publishFingerprint?: string | null;
    /** Content hash recorded at download time (provenance only). */
    contentHash?: string | null;
    /** When the snapshot was downloaded/refreshed into this environment (ISO datetime). */
    downloadedAt?: string | null;
  } | null;
  meta?: {
    createdBy?: string;
    created?: string;
    updated?: string;
  };
}

export const PAGE_SIZE = 20;

export interface ListResult {
  rows: AgentDefinitionRow[];
  hasMore: boolean;
}

// Escape a value for embedding inside a double-quoted C3 filter literal — backslash first, then the
// quote — so a name containing either can't break out of the literal or inject filter syntax.
function escapeFilterLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function listDefinitions(offset = 0, limit = PAGE_SIZE, search?: string): Promise<ListResult> {
  // A non-empty `search` becomes a case-insensitive name+description substring filter on the
  // FetchSpec, so the server (not the loaded page) decides what matches across all pages. Only added
  // when the term is non-empty; an empty term lists everything.
  //
  // Uses `list` with `includeDownloaded: true` so the agent picker includes BOTH origins — local
  // definitions and read-only downloaded snapshots — since a downloaded agent is chattable. `list`
  // forwards `filter`, returns the `{objs, hasMore}` shape, and tags each row with `origin` so the
  // picker can mark downloaded agents.
  const spec: { offset: number; limit: number; filter?: string } = { offset, limit };
  const trimmed = search?.trim();
  if (trimmed) {
    const escaped = escapeFilterLiteral(trimmed);
    spec.filter = `containsIgnoreCase(name, "${escaped}") || containsIgnoreCase(description, "${escaped}")`;
  }
  const raw = (await c3call(API_TYPE, 'list', { spec, includeDownloaded: true })) as
    | { objs?: unknown[]; count?: number; hasMore?: boolean }
    | undefined;
  const objs = raw?.objs;
  return {
    rows: Array.isArray(objs) ? (objs as AgentDefinitionRow[]) : [],
    hasMore: raw?.hasMore === true,
  };
}

export interface AvailableModel {
  id: string;
  label: string;
}

/** Where the picker's option set comes from — see Nexus.Agent.DefinitionApi.listAvailableModels. */
export type ModelSource = 'static' | 'litellm';

export interface AvailableModelsResult {
  source: ModelSource;
  models: AvailableModel[];
  /** App-configured default captured with this exact model-policy generation. */
  defaultModel?: string;
  /** Stable opaque hash over routing-relevant policy fields. Absent on an older backend. */
  policyGeneration?: string;
  /** Ordered Auto candidates that are part of the same published model snapshot. */
  autoTierCandidates?: {
    low: string[];
    medium: string[];
    high: string[];
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];
}

export async function fetchAvailableModels(): Promise<AvailableModelsResult> {
  const raw = await c3call(API_TYPE, 'listAvailableModels', {});
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<AvailableModelsResult>;
  const tiers = obj.autoTierCandidates;
  return {
    source: obj.source === 'litellm' ? 'litellm' : 'static',
    models: Array.isArray(obj.models) ? obj.models : [],
    ...(typeof obj.defaultModel === 'string' ? { defaultModel: obj.defaultModel } : {}),
    ...(typeof obj.policyGeneration === 'string' ? { policyGeneration: obj.policyGeneration } : {}),
    ...(tiers && typeof tiers === 'object'
      ? {
          autoTierCandidates: {
            low: stringArray(tiers.low),
            medium: stringArray(tiers.medium),
            high: stringArray(tiers.high),
          },
        }
      : {}),
  };
}
