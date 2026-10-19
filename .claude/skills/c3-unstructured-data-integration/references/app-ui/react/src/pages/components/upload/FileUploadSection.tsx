/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getContentType, SUPPORTED_FILE_TYPES } from './uploadUtils';

interface FileUploadSectionProps {
  onFileSelect: (files: File[]) => void;
  selectedFiles: File[];
}

const MAX_FILE_SIZE = 1073741824; // 1GB in bytes
const MAX_TOTAL_SIZE = 1073741824; // 1024MB in bytes

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({ onFileSelect, selectedFiles }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejectedFileNames, setRejectedFileNames] = useState<string[]>([]);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    validateAndSetFiles(selectedFiles);
  };

  const validateAndSetFiles = (newFiles: File[]) => {
    const validFiles: File[] = [];
    const rejected: string[] = [];
    let totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

    for (const file of newFiles) {
      const isDuplicate = selectedFiles.some((f) => f.name === file.name);
      if (file.size > MAX_FILE_SIZE || totalSize + file.size > MAX_TOTAL_SIZE) {
        // Rejected before it can be listed: exceeds per-file or total-size limit.
        rejected.push(file.name);
      } else if (!isDuplicate) {
        validFiles.push(file);
        totalSize += file.size;
      }
    }

    setRejectedFileNames(rejected);

    if (validFiles.length > 0) {
      onFileSelect([...selectedFiles, ...validFiles]);
    }
  };

  const isUnsupported = (file: File): boolean =>
    file.size > 0 && !SUPPORTED_FILE_TYPES.includes(getContentType(file.name));
  const isEmpty = (file: File): boolean => file.size === 0;

  const getFileError = (file: File): string => {
    if (isEmpty(file)) return t('documents.upload.fileEmpty');
    if (isUnsupported(file)) return t('documents.upload.fileUnsupported');
    return '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    validateAndSetFiles(droppedFiles);
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    onFileSelect(newFiles);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <div>
      <div
        className={`rounded-sm border-2 border-dashed p-4 transition-colors ${
          isDragging ? 'border-accent bg-accent-weak' : 'border-weak'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={handleBrowseClick}
            className="bg-accent text-inverse rounded-xs min-w-[100px] flex-shrink-0 px-4 py-2 text-sm font-medium transition-colors hover:bg-accent-hover focus:outline-none"
          >
            {t('documents.upload.browse')}
          </button>
          <div className="text-left flex-1">
            <p className="text-sm font-semibold text-primary">{t('documents.upload.dragDropHint')}</p>
            <div className="text-sm mt-1 text-secondary">
              <p>{t('documents.upload.maxFileSize')}</p>
              <p>{t('documents.upload.totalSizeLimit')}</p>
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
          accept=".c3doc.md,.c3doc,.md,.MD,.ipynb,.IPYNB,.pdf,.PDF,.c3typ,.doc,.DOC,.docx,.DOCX,.html,.HTML,.pptx,.PPTX,.txt,.TXT,.rtf,.RTF,.png,.PNG,.jpeg,.JPEG,.jpg,.JPG,.xlsx,.XLSX"
        />
      </div>

      {/* Rejected files (exceeded size limit before being listed) */}
      {rejectedFileNames.length > 0 && (
        <div className="mt-2 text-sm text-danger" role="alert">
          {t('documents.upload.filesTooLarge', { files: rejectedFileNames.join(', ') })}
        </div>
      )}

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="mt-4">
          <div
            className="space-y-2 overflow-y-auto pr-2"
            style={{
              maxHeight: '150px', // Shows approximately 3 file items
            }}
          >
            {selectedFiles.map((file, index) => {
              // Create a unique key from file properties
              const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
              const fileError = getFileError(file);
              return (
                <div
                  key={fileKey}
                  className={`flex flex-shrink-0 items-center justify-between rounded-xs p-2 text-sm ${
                    fileError ? 'bg-danger-weak' : 'bg-tertiary'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className={`block truncate ${fileError ? 'text-danger' : 'text-primary'}`}>{file.name}</span>
                    {fileError && (
                      <span className="block text-xs text-danger" role="alert">
                        {fileError}
                      </span>
                    )}
                  </div>
                  <span className="text-secondary mx-2 flex-shrink-0">{formatFileSize(file.size)}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-secondary hover:text-primary transition-colors ml-2 flex-shrink-0"
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
