/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from 'axios';

interface AxiosResponse {
  data: any;
}

export function getCookieValue(cookieName: string): string | undefined {
  const cookie = document?.cookie
    ?.split(';')
    ?.map((c) => c.trim())
    .find((c) => c.startsWith(cookieName + '='));
  return cookie ? cookie.split('=')[1] : undefined;
}

export function getAppBaseUrl(): string {
  const c3AppUrlPrefix = getCookieValue('c3AppUrlPrefix');
  const c3env = getCookieValue('c3env');
  const c3app = getCookieValue('c3app');

  let baseUrl = window.location.origin;
  if (c3AppUrlPrefix !== undefined) {
    baseUrl = `${baseUrl}/${c3AppUrlPrefix}`;
  } else if (c3env && c3app) {
    baseUrl = `${baseUrl}/${c3env}/${c3app}`;
  }

  return baseUrl.replace(/\/$/, '');
}

/**
 * Internal helper to perform an Axios POST request with error handling.
 */
const _doAxiosPost = async (url: string, payload: any): Promise<any> => {
  try {
    const response: AxiosResponse = await axios.post(url, payload);
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) {
      throw error.response.data.message;
    } else {
      throw error.message;
    }
  }
};

/**
 * Call a static/class-level C3 API method.
 * The typeName is automatically prepended to the POST body.
 *
 * @param typeName   The C3 type to call (e.g. 'MyType')
 * @param actionName The static function to invoke (e.g. 'fetch')
 * @param spec       Arguments — an array of positional args, or a single object (e.g. filter spec)
 * @returns The response from C3 server
 */
export async function c3Action(typeName: string, actionName: string, spec?: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = spec
    ? Array.isArray(spec)
      ? JSON.stringify([typeName, ...spec])
      : JSON.stringify([typeName, spec])
    : undefined;

  return _doAxiosPost(url, payload);
}

/**
 * Convenience wrapper for fetching a single entity by ID.
 */
export async function c3GetAction(typeName: string, id: string, include: string = 'id'): Promise<any> {
  return await c3MemberAction(typeName, 'get', { id }, include);
}

/**
 * Call a C3 API method that creates or upserts an entity.
 * Unlike c3Action, the typeName is NOT prepended — only the spec is sent.
 *
 * @param typeName   The C3 type to call (e.g. 'MyType')
 * @param actionName The function to invoke (e.g. 'create', 'upsert')
 * @param spec       The entity object to create/upsert
 * @returns The response from C3 server
 */
export async function c3CreateAction(typeName: string, actionName: string, spec: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = JSON.stringify([spec]);

  return _doAxiosPost(url, payload);
}

/**
 * Call a C3 API member function on a specific entity instance.
 * The instance object is prepended to the POST body instead of the typeName.
 *
 * @param typeName   The C3 type to call (e.g. 'MyType')
 * @param actionName The member function to invoke (e.g. 'get')
 * @param instance   The entity instance (e.g. { id: '...' })
 * @param spec       Arguments — an array of positional args, or a single value
 * @returns The response from C3 server
 */
export async function c3MemberAction(typeName: string, actionName: string, instance: any, spec?: any): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const payload = spec
    ? Array.isArray(spec)
      ? JSON.stringify([instance, ...spec])
      : JSON.stringify([instance, spec])
    : JSON.stringify([instance]);

  return _doAxiosPost(url, payload);
}

export default c3Action;
