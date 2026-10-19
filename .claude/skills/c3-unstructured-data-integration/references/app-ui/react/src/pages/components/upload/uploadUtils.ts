/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Supported file types matching the original app
export const SUPPORTED_FILE_TYPES = [
  'c3doc.md',
  'c3doc',
  'md',
  'ipynb',
  'pdf',
  'c3typ',
  'doc',
  'docx',
  'html',
  'pptx',
  'txt',
  'rtf',
  'jpeg',
  'png',
  'jpg',
  'xlsx',
];

// File validation status
export enum FileValidationStatus {
  VALID = 'VALID',
  INVALID = 'INVALID',
  EMPTY = 'EMPTY',
}

// File upload status
export enum FileUploadStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  SUCCESSFUL = 'SUCCESSFUL',
  INVALID = 'INVALID',
  ERROR = 'ERROR',
}

// File validation result
export interface FileValidationResult {
  validFiles: File[];
  invalidFiles: File[];
  emptyFiles: File[];
}

/**
 * Get file extension/content type from filename
 * Matches the behavior of getContentType in GenAiUiTransformUtil.ts
 */
export function getContentType(filename: string): string {
  const fileExt = filename.slice(filename.lastIndexOf('.') + 1);
  return filename.indexOf('.') === -1 ? '' : fileExt.toLowerCase();
}

/**
 * Validate files and separate them into valid, invalid, and empty files
 * Matches the validation logic from GenAiUiEpicUploadDocuments.ts
 */
export function validateFiles(files: File[]): FileValidationResult {
  const validFiles: File[] = [];
  const invalidFiles: File[] = [];
  const emptyFiles: File[] = [];

  files.forEach((file) => {
    const fileType = getContentType(file.name);

    if (file.size > 0) {
      // File has content - check if type is supported
      if (SUPPORTED_FILE_TYPES.includes(fileType)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file);
      }
    } else {
      // File is empty
      emptyFiles.push(file);
    }
  });

  return {
    validFiles,
    invalidFiles,
    emptyFiles,
  };
}

/**
 * Sanitize file name for use in file paths
 * Matches the behavior of sanitizeFileName in GenAiUiTransformUtil.ts
 * Removes characters not allowed in Gcs, S3, or ADLS file path
 */
export function sanitizeFileName(fileName: string = ''): string {
  // Remove blank spaces and replace with underscores
  const strWithoutBlankSpaces = fileName.trim().replace(/ /g, '_');

  // Replace opening brackets
  const strWithParsedOpeningBrackets = strWithoutBlankSpaces.replace(/[{[<]/g, '(');

  // Replace closing brackets
  const strWithParsedClosingBrackets = strWithParsedOpeningBrackets.replace(/[}\]>]/g, ')');

  // Replace special characters
  const strWithParsedSpecialChars = strWithParsedClosingBrackets.replace(/[%^]/g, '_');

  /*
   * Remove accents and special characters (ie: España -> Espana, camión -> camion)
   * Source: https://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
   */
  const strWithoutAccents = strWithParsedSpecialChars.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Keep only alphanumeric, dots, parentheses, underscores, and hyphens
  const strWithoutSpecialCharacters = strWithoutAccents.replace(/[^a-zA-Z0-9.()_-]/g, '');

  return strWithoutSpecialCharacters;
}

/**
 * Get MIME type from file
 * Matches the behavior of getMimeType in GenAiUiTransformUtil.ts
 */
export function getMimeType(file: File): string {
  const fileName = file.name;
  const fileExtension = fileName.substring(fileName.lastIndexOf('.') + 1);
  const mimeTypes: Record<string, string> = {
    md: 'text/markdown',
    ipynb: 'application/x-ipynb+json',
  };
  return file.type || mimeTypes[fileExtension] || 'text/plain';
}

/**
 * Get file name from URL
 * Matches the behavior of getFileName in GenAiUiTransformUtil.ts
 */
export function getFileName(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1);
}

/**
 * Read file as ArrayBuffer and convert to Uint8Array
 * Matches the behavior of readFile in GenAiUiEpicUploadDocuments.ts
 */
export function readFile(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(file);
    fileReader.onload = (event) => {
      if (event.target?.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(event.target.result));
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'));
      }
    };
    fileReader.onerror = reject;
  });
}
