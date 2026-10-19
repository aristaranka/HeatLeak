/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

const REGION_PREFIX = /^(us|eu|apac|apne|global|ap|sa)\./i;
const PROVIDER_PREFIX = /^(anthropic|amazon|google|meta|openai|mistral|deepseek|cohere|ai21|stability)\./i;
// Route/provider tokens that sometimes lead the name, plus noise suffixes that add nothing readable.
// Azure OpenAI registers models by *deployment* name, which prepends the resource/org and appends the
// region + SKU (plat-c3-c3-eastus2-gpt-5.4-globalstandard-…) — all routing noise, none of it a model
// family. Kept as an explicit token list rather than a pattern: a fuzzy rule (e.g. "anything ending in
// a digit") would eat real family tokens like `gpt-4o` or `o3`.
const DROP = new Set([
  'bedrock',
  'converse',
  'litellm',
  'it',
  'instruct',
  'latest',
  'chat',
  'hf',
  // Azure org / resource prefixes.
  'plat',
  'c3',
  // Azure regions.
  'eastus',
  'eastus2',
  'westus',
  'westus2',
  'westus3',
  'centralus',
  'northcentralus',
  'southcentralus',
  'northeurope',
  'westeurope',
  'swedencentral',
  'uksouth',
  'francecentral',
  'japaneast',
  'australiaeast',
  // Azure deployment SKUs.
  'globalstandard',
  'datazonestandard',
  'standard',
  'provisioned',
  'datazone',
  'globalbatch',
]);
// Tokens whose natural casing is not simple Title-case.
const SPECIAL: Record<string, string> = { gpt: 'GPT', oss: 'OSS', ai: 'AI', llm: 'LLM' };

function routeScopeLabel(rawId: string): string {
  const raw = (rawId || '').trim();
  const tail = raw.substring(raw.lastIndexOf('/') + 1);
  const match = tail.match(REGION_PREFIX);
  if (!match) return '';
  const scope = match[1].toLowerCase();
  // These are locale-neutral route/config tokens, not natural-language scope labels.
  return scope === 'global' ? 'GLOBAL' : scope.toUpperCase();
}

type RouteIdentityField = 'scope' | 'config' | 'source' | 'upstream' | 'combined' | 'tail' | 'id';

function routeIdentity(rawId: string): Record<RouteIdentityField, string> {
  const id = (rawId || '').trim();
  const slash = id.lastIndexOf('/');
  const tail = id.substring(slash + 1);
  const source = slash > 0 ? id.substring(0, id.indexOf('/')) : '';
  const suffixAt = tail.indexOf('__');
  const config = suffixAt >= 0 ? tail.substring(suffixAt + 2) : '';
  const route = suffixAt >= 0 ? tail.substring(0, suffixAt) : tail;
  const tokens = route.split('.');
  const first = (tokens[0] || '').toLowerCase();
  const hasScope = /^(us|eu|apac|apne|global|ap|sa)$/.test(first);
  const upstream = tokens[hasScope ? 1 : 0] || '';
  const scope = routeScopeLabel(id);
  const combined = [...new Set([scope, source, upstream, config].filter(Boolean))].join(' · ');
  return { scope, config, source, upstream, combined, tail, id };
}

/**
 * User-friendly display name derived from a raw model route/id — the client-side safety net used when
 * the backend label is missing or still equals the raw id (see modelOptions.buildModelOptions). Mirrors
 * the backend `_friendlyModelLabel` in Nexus.Agent.DefinitionApi.js: it strips routing noise (provider
 * route prefix, region, store/bedrock revision, embedded date) and formats the surviving family +
 * generation + size tokens:
 *   us.anthropic.claude-sonnet-4-6 -> "Claude Sonnet 4.6"
 *   google.gemma-3-27b-it          -> "Gemma 3 27B"
 *   amazon.nova-2-lite-v1:0        -> "Nova 2 Lite"
 *   gpt-oss-120b                   -> "GPT-OSS 120B"
 * Azure OpenAI is registered by deployment name, which wraps the family in resource/region/SKU/date
 * tokens — those are dropped too:
 *   plat-c3-c3-eastus2-gpt-5.4-globalstandard-2026-03-05 -> "GPT 5.4"
 * Heuristic by construction; falls back to the bare tail (then the raw id) when nothing parses.
 */
export function friendlyModelLabel(rawId: string): string {
  let raw = (rawId || '').trim();
  if (!raw) return '';
  // A per-credential `__<configName>` disambiguator (LiteLlmProxy.ModelRegistry's route suffix for a
  // non-primary region/account row) is routing identity, not part of the model family or
  // generation. Split it off before the family-label heuristics below (it would otherwise tokenize
  // alongside the version digits and get title-cased into the middle of the name), then reattach as a
  // distinct trailing "(configName)" so a multi-region/account route still reads clearly.
  let regionSuffix = '';
  const suffixIdx = raw.indexOf('__');
  if (suffixIdx >= 0) {
    regionSuffix = raw.slice(suffixIdx + 2);
    raw = raw.slice(0, suffixIdx);
  }
  // Tail after the last '/', dropping any provider route prefix (bedrock_converse/, litellm/, openai/).
  let tail = raw.substring(raw.lastIndexOf('/') + 1);
  tail = tail.replace(REGION_PREFIX, '').replace(PROVIDER_PREFIX, '');
  const s = tail
    .toLowerCase()
    .replace(/-v\d+(?::\d+)?$/i, '') // -v1:0 trailing store revision
    .replace(/-\d+:\d+$/, '') // -1:0 bedrock revision
    .replace(/:\d+$/, '') // trailing :0
    .replace(/20\d{2}-\d{2}-\d{2}/g, '') // YYYY-MM-DD release date (Azure deployment names)
    .replace(/20\d{6}/g, '') // YYYYMMDD release date
    .replace(/\b(2[4-9]|3\d)(0[1-9]|1[0-2])\b/g, ''); // YYMM release date
  const withSuffix = (base: string) => (regionSuffix ? `${base} (${regionSuffix})` : base);
  const tokens = s.split(/[-._\s]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return withSuffix(tail || raw);

  const out: string[] = [];
  let droppedSku = false;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (DROP.has(tk)) {
      droppedSku = true;
      continue;
    }
    // Skip trailing single-digit version markers after a SKU token (e.g., "1" after "globalstandard").
    if (i === tokens.length - 1 && droppedSku && /^[0-9]$/.test(tk)) continue;
    // Merge an adjacent pair of plain 1-2 digit numbers into major.minor (claude-sonnet-4-6 -> "4.6").
    if (/^\d{1,2}$/.test(tk) && i + 1 < tokens.length && /^\d{1,2}$/.test(tokens[i + 1])) {
      out.push(`${tk}.${tokens[i + 1]}`);
      i++;
      continue;
    }
    if (/^\d+(x\d+)?b$/.test(tk)) {
      out.push(tk.toUpperCase()); // param count: 27b / 120b / 8x7b
      continue;
    }
    if (/^\d+$/.test(tk)) {
      out.push(tk); // bare generation number (claude-sonnet-5 -> "5")
      continue;
    }
    out.push(SPECIAL[tk] ?? tk.charAt(0).toUpperCase() + tk.slice(1));
  }
  const label = out
    .join(' ')
    .replace(/\bGPT OSS\b/, 'GPT-OSS')
    .trim();
  return withSuffix(label || tail || raw);
}

/**
 * True when a backend-supplied label is really a raw model route rather than a display name. Kept
 * deliberately narrow so a genuine admin display-name override always wins (that override is the
 * backend's `label`, and "admin override wins" is the contract) — we only reclaim the cases where the
 * label literally *is* the route, never merely because a name is compact or carries a version dot
 * (e.g. a terse admin name like "GPT-4.6" or "v2.5-turbo" must be preserved):
 *   - it equals the id, or is a trailing path-segment of it (the backend just echoed the route tail,
 *     e.g. id `amazon-bedrock/us.anthropic.claude-sonnet-4-6`, label `us.anthropic.claude-sonnet-4-6`);
 *   - it contains a `/` (a `provider/model` route — a shape a display name never takes).
 */
function looksLikeRawRoute(label: string, id: string): boolean {
  if (label === id || id.endsWith(`/${label}`)) return true;
  return label.includes('/');
}

/**
 * Resolve the label to display for a model: the backend-supplied `label` when it is a real friendly
 * name, otherwise the client-derived {@link friendlyModelLabel}. A backend label that is blank or is
 * itself a raw route (see {@link looksLikeRawRoute}) means no friendly name was produced upstream, so
 * fall back to deriving one here.
 */
export function resolveModelLabel(id: string, label?: string | null): string {
  const trimmed = (label ?? '').trim();
  if (trimmed && !looksLikeRawRoute(trimmed, id)) return trimmed;
  return friendlyModelLabel(id);
}

/**
 * Add the shortest stable route qualifier only when distinct ids otherwise render with the same
 * friendly label. Scope is preferred, followed by config/provider identity and ultimately the full
 * route. The last-resort ordinal keeps malformed exact-duplicate rows unique too. This is also a
 * compatibility safety net for pod-only startup catalogs and older backend snapshots.
 */
export function disambiguateModelLabels<T extends { id: string; label: string }>(models: T[]): T[] {
  const groups = new Map<string, number[]>();
  models.forEach((model, index) => {
    const label = (model.label || '').trim();
    if (!label) return;
    const key = label.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });

  const occupied = new Set<string>();
  for (const [key, group] of groups) {
    if (group.length === 1) occupied.add(key);
  }

  const result = [...models];
  const fields: RouteIdentityField[] = ['scope', 'config', 'source', 'upstream', 'combined', 'tail', 'id'];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const baseLabel = (models[group[0]].label || '').trim();
    let qualified: string[] | null = null;
    for (const field of fields) {
      const seen = new Set<string>();
      const candidates: string[] = [];
      let valid = true;
      for (const index of group) {
        const qualifier = routeIdentity(models[index].id)[field];
        if (!qualifier) {
          valid = false;
          break;
        }
        const candidate = `${baseLabel} (${qualifier})`;
        const key = candidate.toLowerCase();
        if (seen.has(key) || occupied.has(key)) {
          valid = false;
          break;
        }
        seen.add(key);
        candidates.push(candidate);
      }
      if (valid) {
        qualified = candidates;
        break;
      }
    }

    if (!qualified) {
      qualified = group.map((index) => {
        const rawId = String(models[index].id || 'route');
        let candidate = `${baseLabel} (${rawId})`;
        let ordinal = 2;
        while (occupied.has(candidate.toLowerCase())) {
          candidate = `${baseLabel} (${rawId} · ${ordinal})`;
          ordinal += 1;
        }
        // Reserve immediately so later rows in this same group cannot reuse this ordinal.
        occupied.add(candidate.toLowerCase());
        return candidate;
      });
    }

    group.forEach((index, groupIndex) => {
      result[index] = { ...models[index], label: qualified![groupIndex] };
      occupied.add(qualified![groupIndex].toLowerCase());
    });
  }
  return result;
}

/**
 * Native `title` text for a model control: friendly label on the first line, unresolved route on the
 * second. Collapses to a single line when either side is blank or both are identical (no duplicate).
 */
export function modelRouteTooltip(resolved: string, unresolved: string): string {
  const a = (resolved || '').trim();
  const b = (unresolved || '').trim();
  if (!a) return b;
  if (!b || a === b) return a;
  return `${a}\n${b}`;
}

/** Select option for a model id: friendly `label` + two-line `title` (resolved \\n unresolved). */
export function toModelSelectOption(
  id: string,
  catalogLabel?: string | null
): { value: string; label: string; title: string } {
  const label = resolveModelLabel(id, catalogLabel);
  return { value: id, label, title: modelRouteTooltip(label, id) };
}
