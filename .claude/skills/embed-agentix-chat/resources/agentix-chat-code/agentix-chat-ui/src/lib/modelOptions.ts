/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { disambiguateModelLabels, resolveModelLabel } from './modelLabel';
import type { AvailableModelsResult } from './agentDefsApi';
import type { ModelAvailability, ModelAvailabilityReason, ModelInfo, ModelsResponse, PodCatalogState } from './chatApi';

type Availability = { availability?: ModelAvailability; availabilityReason?: ModelAvailabilityReason };
export type AutoAvailability = { availability: ModelAvailability; reason?: ModelAvailabilityReason };

/**
 * Classify Auto independently from fixed model rows. Auto is usable only when the pod can prove a
 * proxy-backed tier. Older LiteLLM pods keep the historical behavior because their catalog predates
 * the viability bit; startup-direct and standalone fixed-model pods expose no catalog and must not
 * offer an Auto choice that their transport rejects.
 */
export function resolveAutoAvailability(
  available: AvailableModelsResult | undefined,
  info: ModelsResponse | null
): AutoAvailability {
  if (!info) return { availability: 'pending', reason: 'syncing' };
  const catalog = info.catalog;
  const generationFencedPolicy = available?.source === 'litellm' && !!available.policyGeneration;
  const legacyProxyBacked = info.models.some(
    (model) => model.providerID === 'litellm' || model.id.startsWith('litellm/')
  );
  // A strict pod is authoritative about whether Auto is viable even while the app-global policy
  // query is loading or failed. Do not fall through to the legacy "any catalog means Auto" rule:
  // strict turn admission rejects while applyPending and when no tier intersection is viable.
  if (catalog?.routingContractVersion) {
    if (
      catalog.applyPending ||
      !catalog.policyGeneration ||
      (generationFencedPolicy && catalog.policyGeneration !== available?.policyGeneration)
    ) {
      return { availability: 'pending', reason: 'syncing' };
    }
    return catalog.autoViable ? { availability: 'available' } : { availability: 'unavailable', reason: 'noAutoRoute' };
  }
  if (generationFencedPolicy) {
    return legacyProxyBacked
      ? { availability: 'available' }
      : { availability: 'unavailable', reason: 'podUpgradeRequired' };
  }
  if (!catalog) {
    return legacyProxyBacked ? { availability: 'available' } : { availability: 'unavailable', reason: 'noAutoRoute' };
  }
  return { availability: 'available' };
}

/**
 * Classify a registry model the pod does not declare.
 *
 * Two authorities produce the picker: the C3 registry (app-global — what the org enabled) and the
 * pod's own opencode catalog (what this pod can address). A model is sendable only if it is in
 * both, and `registry \ pod` non-empty has two causes that look identical from here: the pod is
 * still converging on a model just registered, or the pod has converged and the proxy does not
 * serve it. Hiding either would repeat the bug this replaced (a newly-registered model invisible
 * with no recovery path); offering either is what makes the picker lie today.
 *
 * The two causes separate on ONE question — has the pod asked the proxy since this registry
 * snapshot was taken? If not, a scrape covering the model is still owed, so `pending`. If it has
 * asked and still lacks the model, patience will not help, so `unavailable`. Both sides of that
 * comparison are ages on their own clock, so no clock skew enters it. A pod that has never
 * scraped in-process (`lastRefreshAgeMs === null`) owes one by definition, and one that has
 * stopped scraping (`refreshIntervalMs === 0`) never will.
 *
 * A pod that cannot speak to its own currency (no `catalog`) yields no stamp at all — the option
 * renders exactly as it did before this field existed.
 */
function classifyMissing(
  catalog: PodCatalogState | undefined,
  registryAgeMs: number,
  generationFencedPolicy: boolean
): Availability {
  if (!catalog) {
    return generationFencedPolicy ? { availability: 'unavailable', availabilityReason: 'podUpgradeRequired' } : {};
  }
  if (generationFencedPolicy && !catalog.routingContractVersion) {
    return { availability: 'unavailable', availabilityReason: 'podUpgradeRequired' };
  }
  if (
    catalog.refreshIntervalMs > 0 &&
    (catalog.lastRefreshAgeMs === null || registryAgeMs < catalog.lastRefreshAgeMs)
  ) {
    return { availability: 'pending', availabilityReason: 'syncing' };
  }
  let reason: ModelAvailabilityReason = 'notServed';
  if (catalog.refreshIntervalMs <= 0) reason = 'frozen';
  else if (catalog.lastRefreshOk === false) reason = 'proxyUnreachable';
  return { availability: 'unavailable', availabilityReason: reason };
}

/**
 * Build the chat model picker's option list from the agent pod's opencode catalog (`info`) and the
 * C3 backend's available-models result (`available`). The backend's `source` decides the merge:
 *
 *   - `static`  — the pod catalog is the option set; the C3 list overlays admin display names by id
 *                 (the historical behaviour).
 *   - `litellm` — the C3 list (the curated, registry-backed subset) IS the option set; the pod
 *                 catalog is joined by id only for capabilities (reasoning-effort `variants`,
 *                 `providerID`). A registry model absent from the pod catalog still appears, without
 *                 variants, carrying an `availability` stamp so the picker can show it without
 *                 offering it (see classifyMissing).
 *
 * Either way the list is ordered with the pod's default model first, then alphabetically by id.
 *
 * @param registryAgeMs how long ago the `available` snapshot was fetched, in ms on the CALLER's
 *        clock. Only consulted for a pod-missing model; 0 (a snapshot just taken) is the safe
 *        default because it can only bias a genuinely-missing model towards `pending`, which is
 *        also not selectable — it never makes an unsendable model look sendable.
 */
export function buildModelOptions(
  info: ModelsResponse,
  available: AvailableModelsResult,
  registryAgeMs = 0
): ModelInfo[] {
  const strictCatalog = info.catalog?.routingContractVersion ? info.catalog : null;
  const strictApplyPending = !!(
    strictCatalog &&
    (strictCatalog.applyPending ||
      !strictCatalog.policyGeneration ||
      (available.source === 'litellm' &&
        !!available.policyGeneration &&
        strictCatalog.policyGeneration !== available.policyGeneration))
  );
  const stampStrictPending = (model: ModelInfo): ModelInfo => {
    return strictApplyPending ? { ...model, availability: 'pending', availabilityReason: 'syncing' } : model;
  };
  const byDefaultThenId = (a: ModelInfo, b: ModelInfo) => {
    if (a.id === info.defaultModel) return -1;
    if (b.id === info.defaultModel) return 1;
    return a.id.localeCompare(b.id);
  };
  const finalize = (models: ModelInfo[]) => disambiguateModelLabels(models.sort(byDefaultThenId));

  if (available.source === 'litellm') {
    const generationFencedPolicy = !!available.policyGeneration;
    // A new backend can publish the fenced policy while an already-owned pod is still running the
    // backward-compatible startup generation. Its advertised hardcoded/direct routes remain valid
    // until the pod either activates the contract in place (new sidecars advertise that capability)
    // or is naturally restarted (older sidecars). Keep its pod catalog as the option set during that
    // window; showing the new registry set as "syncing" would both lie and disable a working chat.
    // Strict pods publish routingContractVersion, including while their first catalog is applying.
    if (generationFencedPolicy && !info.catalog?.routingContractVersion) {
      const labelById = new Map(available.models.map((model) => [model.id, model.label]));
      return finalize(
        [...info.models].map((model) => ({
          ...model,
          label: resolveModelLabel(model.id, labelById.get(model.id) ?? model.label),
        }))
      );
    }
    const podById = new Map(info.models.map((m) => [m.id, m]));
    const strictConverged = !!(
      strictCatalog &&
      !strictApplyPending &&
      !!available.policyGeneration &&
      strictCatalog.policyGeneration === available.policyGeneration
    );
    return finalize(
      available.models.map((a): ModelInfo => {
        const label = resolveModelLabel(a.id, a.label);
        const pod = podById.get(a.id);
        const model = pod
          ? { ...pod, label }
          : strictConverged
            ? {
                id: a.id,
                providerID: '',
                modelID: a.id,
                label,
                availability: 'unavailable' as const,
                availabilityReason: 'notServed' as const,
              }
            : {
                id: a.id,
                providerID: '',
                modelID: a.id,
                label,
                ...classifyMissing(info.catalog, registryAgeMs, generationFencedPolicy),
              };
        return stampStrictPending(model);
      })
    );
  }

  const labelById = new Map(available.models.map((m) => [m.id, m.label]));
  return finalize(
    [...info.models].map((m) =>
      stampStrictPending({ ...m, label: resolveModelLabel(m.id, labelById.get(m.id) ?? m.label) })
    )
  );
}
