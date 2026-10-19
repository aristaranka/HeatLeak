/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

export const APP_PANEL_MIN_WIDTH = 320;
export const APP_PANEL_DEFAULT_WIDTH = 640;
export const APP_PANEL_CHAT_RESERVE = 420;
export const APP_PANEL_WIDTH_STORAGE_KEY = 'nexus.appPanelWidth';

export function getAppPanelMaxWidth(availableWidth: number): number {
  return Math.max(APP_PANEL_MIN_WIDTH, availableWidth - APP_PANEL_CHAT_RESERVE);
}

export function clampAppPanelWidth(px: number, availableWidth = Number.POSITIVE_INFINITY): number {
  return Math.min(getAppPanelMaxWidth(availableWidth), Math.max(APP_PANEL_MIN_WIDTH, px));
}

export function readAppPanelWidth(): number {
  const saved = Number(localStorage.getItem(APP_PANEL_WIDTH_STORAGE_KEY));
  return Number.isFinite(saved) && saved >= APP_PANEL_MIN_WIDTH ? saved : APP_PANEL_DEFAULT_WIDTH;
}

export function persistAppPanelWidth(px: number): void {
  localStorage.setItem(APP_PANEL_WIDTH_STORAGE_KEY, String(Math.max(APP_PANEL_MIN_WIDTH, px)));
}
