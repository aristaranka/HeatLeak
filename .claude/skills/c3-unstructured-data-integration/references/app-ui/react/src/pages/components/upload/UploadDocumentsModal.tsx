/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, ChevronDown, Check } from 'lucide-react';
import axios from 'axios';

import { c3Action, c3GetAction, getAppBaseUrl } from '../../../c3Action';
import {
  getUrlFromMount,
  uploadToSourceCollection,
  addSourceFilesToIndex,
  deleteFilesBatch,
} from '../../../shared/api';
import { FileUploadSection } from './FileUploadSection';
import { TagsSection } from './TagsSection';
import {
  validateFiles,
  FileValidationStatus,
  FileUploadStatus,
  sanitizeFileName,
  getMimeType,
  readFile,
  getFileName,
} from './uploadUtils';

interface UploadFormData {
  files: File[];
  sourceDirectory: string | null;
  automaticallyUpdateIndex: boolean;
  tags: Array<{ tagValue: string; tagType: string }>;
}

interface UploadDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: UploadFormData) => Promise<void>;
  hasSourceDirectory: boolean;
}

interface Collection {
  id?: string;
  value?: string;
  name?: string;
  label?: string;
  displayName?: string;
}

const UploadDocumentsModal: React.FC<UploadDocumentsModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  hasSourceDirectory,
}) => {
  const { t } = useTranslation();

  const createDefaultCollectionOption = (): Array<{ id: string; name: string }> => {
    return [{ id: 'default', name: t('documents.upload.defaultCollection') }];
  };

  const createCollectionOption = (collection: Collection): { id: string; name: string } => {
    return {
      id: collection.id || collection.value || 'default',
      name: collection.name || collection.label || collection.displayName || t('documents.upload.defaultCollection'),
    };
  };

  const [files, setFiles] = useState<File[]>([]);
  const [, setFileStatuses] = useState<Map<string, FileValidationStatus>>(new Map());
  const [fileUploadStatuses, setFileUploadStatuses] = useState<Map<string, FileUploadStatus>>(new Map());
  const [tempFilesMountUrl, setTempFilesMountUrl] = useState<string | null>(null);
  const [sourceDirectory, setSourceDirectory] = useState<string | null>(null);
  const [automaticallyUpdateIndex, setAutomaticallyUpdateIndex] = useState(true);
  const [tags, setTags] = useState<Array<{ tagValue: string; tagType: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showTagForm, setShowTagForm] = useState(false);
  const [tagFormValues, setTagFormValues] = useState({ tagValue: '', tagType: '' });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [sourceDirectoryOptions, setSourceDirectoryOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<{ status: 'WARNING' | ''; title: string; subtitle: string }>(
    {
      status: '',
      title: '',
      subtitle: '',
    }
  );

  // Fetch source collections when modal opens (lazy loading - matches original app pattern)
  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;

    const fetchSourceCollections = async () => {
      try {
        const response = await c3Action('Genai.SourceCollection', 'fetch');
        if (isCancelled) return;

        const collections = response?.objs ?? [];

        if (collections.length > 0) {
          // Convert all collections to options format
          const allCollectionOptions = collections.map((collection: Collection) => createCollectionOption(collection));
          setSourceDirectoryOptions(allCollectionOptions);

          // Default to the first directory so users don't have to pick one manually.
          setSourceDirectory(allCollectionOptions[0].id);
        } else {
          // No collections found, use fallback
          const fallbackOptions = createDefaultCollectionOption();
          setSourceDirectoryOptions(fallbackOptions);
          setSourceDirectory(fallbackOptions[0].id);
        }
      } catch {
        if (isCancelled) return;

        // On error, use fallback
        const fallbackOptions = createDefaultCollectionOption();
        setSourceDirectoryOptions(fallbackOptions);
        setSourceDirectory(fallbackOptions[0].id);
      }
    };

    fetchSourceCollections();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isCancelled = true;
    };
  }, [isOpen, t]);

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowTagForm(false);
      setTagFormValues({ tagValue: '', tagType: '' });
      setFiles([]);
      setFileStatuses(new Map());
      setFileUploadStatuses(new Map());
      setTempFilesMountUrl(null);
      setTags([]);
      setSourceDirectory(null);
      setAutomaticallyUpdateIndex(true);
      setIsUploading(false);
      setDuplicateWarning({ status: '', title: '', subtitle: '' });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!sourceDirectory || files.length === 0) {
      // Clear warning if no collection selected or no files
      setDuplicateWarning({ status: '', title: '', subtitle: '' });
      return;
    }

    let isCancelled = false;

    const checkForDuplicates = async () => {
      try {
        // Fetch collection files
        const response = await c3GetAction('Genai.SourceCollection', sourceDirectory, 'files.originalFile');
        if (isCancelled) return;

        const collectionFiles = response?.files || [];

        // Extract file names from collection files
        const collectionFileNames = collectionFiles.map((file: { originalFile?: { url?: string } }) => {
          const url = file?.originalFile?.url || '';
          return getFileName(url);
        });

        // Get uploaded file names
        const uploadedFileNames = files.map((file) => file.name);

        // Check for duplicates
        const hasDuplicates = uploadedFileNames.some((fileName) => collectionFileNames.includes(fileName));

        if (isCancelled) return;

        if (hasDuplicates) {
          setDuplicateWarning({
            status: 'WARNING',
            title: t('documents.upload.duplicateTitle'),
            subtitle: t('documents.upload.duplicateSubtitle'),
          });
        } else {
          setDuplicateWarning({ status: '', title: '', subtitle: '' });
        }
      } catch (error) {
        if (isCancelled) return;
        console.error('Error checking for duplicate files:', error);

        // On error, clear warning
        setDuplicateWarning({ status: '', title: '', subtitle: '' });
      }
    };

    checkForDuplicates();

    // Cleanup function
    return () => {
      isCancelled = true;
    };
  }, [sourceDirectory, files, t]);

  const handleAddTag = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const tagValue = tagFormValues.tagValue.trim();
    const tagType = tagFormValues.tagType.trim();

    if (!tagValue || !tagType) {
      return;
    }

    // Create new tag object
    const newTag = { tagValue, tagType };

    // Update tags first (matching original app pattern)
    setTags((prevTags) => [...prevTags, newTag]);

    // Reset form values
    setTagFormValues({ tagValue: '', tagType: '' });

    // Close form - must be called after state updates (matching original app pattern)
    setShowTagForm(false);
  };

  const handleFileSelect = async (selectedFiles: File[]) => {
    const previousFiles = files;
    const removedFiles = previousFiles.filter(
      (prevFile) => !selectedFiles.some((newFile) => newFile.name === prevFile.name)
    );

    if (removedFiles.length > 0 && tempFilesMountUrl) {
      // Clean up removed files from tmp directory
      const removedFileNames = removedFiles.map((file) => file.name);
      cleanupTmpFiles(removedFileNames);

      // Remove upload statuses for removed files
      setFileUploadStatuses((prev) => {
        const newStatuses = new Map(prev);
        removedFileNames.forEach((fileName) => {
          newStatuses.delete(fileName);
        });
        return newStatuses;
      });

      // Remove validation statuses for removed files
      setFileStatuses((prev) => {
        const newStatuses = new Map(prev);
        removedFileNames.forEach((fileName) => {
          newStatuses.delete(fileName);
        });
        return newStatuses;
      });
    }

    // Validate files and track status
    const validationResult = validateFiles(selectedFiles);

    // Update files state with all selected files
    setFiles(selectedFiles);

    // Update file statuses
    setFileStatuses((prev) => {
      const newStatuses = new Map(prev);

      // Set status for valid files
      validationResult.validFiles.forEach((file) => {
        newStatuses.set(file.name, FileValidationStatus.VALID);
      });

      // Set status for invalid files
      validationResult.invalidFiles.forEach((file) => {
        newStatuses.set(file.name, FileValidationStatus.INVALID);
      });

      // Set status for empty files
      validationResult.emptyFiles.forEach((file) => {
        newStatuses.set(file.name, FileValidationStatus.EMPTY);
      });

      return newStatuses;
    });

    // Set upload status for invalid and empty files (matches original app behavior)
    setFileUploadStatuses((prev) => {
      const newStatuses = new Map(prev);

      // Invalid files get INVALID status
      validationResult.invalidFiles.forEach((file) => {
        newStatuses.set(file.name, FileUploadStatus.INVALID);
      });

      // Empty files get ERROR status
      validationResult.emptyFiles.forEach((file) => {
        newStatuses.set(file.name, FileUploadStatus.ERROR);
      });

      return newStatuses;
    });

    let mountUrlToUse = tempFilesMountUrl;
    if (validationResult.validFiles.length > 0 && !tempFilesMountUrl) {
      try {
        const mountUrl = await getUrlFromMount('data-load');
        if (mountUrl && typeof mountUrl === 'string') {
          const tmpMountUrl = `${mountUrl}tmp/`;
          setTempFilesMountUrl(tmpMountUrl);
          mountUrlToUse = tmpMountUrl;
        }
      } catch (error) {
        console.error('Error getting mount URL:', error);
      }
    }

    if (validationResult.validFiles.length > 0 && mountUrlToUse) {
      // Determine which files need uploading (check current status outside state updater)
      const filesToUpload: File[] = [];
      const currentStatuses = fileUploadStatuses;

      validationResult.validFiles.forEach((file) => {
        const currentStatus = currentStatuses.get(file.name);

        // Skip if already uploading or successful
        if (currentStatus !== FileUploadStatus.UPLOADING && currentStatus !== FileUploadStatus.SUCCESSFUL) {
          filesToUpload.push(file);
        }
      });

      // Set all statuses to UPLOADING in one batch (pure state update, no side effects)
      if (filesToUpload.length > 0) {
        setFileUploadStatuses((prev) => {
          const newStatuses = new Map(prev);
          filesToUpload.forEach((file) => {
            newStatuses.set(file.name, FileUploadStatus.UPLOADING);
          });
          return newStatuses;
        });

        // Start uploads outside the state updater (side effects belong here)
        filesToUpload.forEach((file) => {
          uploadFileToTmp(file, mountUrlToUse);
        });
      }
    }
  };

  const cleanupTmpFiles = async (fileNames: string[]) => {
    if (!tempFilesMountUrl || fileNames.length === 0) {
      return;
    }

    try {
      /*
       * Construct file URLs for all files (matches original app behavior)
       * The API will handle files that don't exist gracefully
       */
      const fileUrls = fileNames.map((fileName) => `${tempFilesMountUrl}${sanitizeFileName(fileName)}`);

      // Delete files from tmp directory
      await deleteFilesBatch(fileUrls);
    } catch (error) {
      console.error('Error cleaning up temporary files:', error);
    }
  };

  // Helper function to upload a single file to tmp directory
  const uploadFileToTmp = async (file: File, tmpMountUrl: string) => {
    try {
      // Read file as ArrayBuffer → convert to Uint8Array
      const fileContent = await readFile(file);

      // Get MIME type
      const contentType = getMimeType(file);

      // Construct file path
      const filePath = `${tmpMountUrl}${sanitizeFileName(file.name)}`;

      const appBaseUrl = getAppBaseUrl();
      const apiUrl = `${appBaseUrl}/file/${encodeURIComponent(filePath)}`;

      await axios.post(apiUrl, fileContent, {
        headers: {
          'Content-Type': contentType,
        },
        withCredentials: true,
      });

      // Set status to SUCCESSFUL
      setFileUploadStatuses((prev) => {
        const newStatuses = new Map(prev);
        newStatuses.set(file.name, FileUploadStatus.SUCCESSFUL);
        return newStatuses;
      });
    } catch (error) {
      console.error(`Error uploading file ${file.name}:`, error);

      // Set status to ERROR
      setFileUploadStatuses((prev) => {
        const newStatuses = new Map(prev);
        newStatuses.set(file.name, FileUploadStatus.ERROR);
        return newStatuses;
      });
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);
    try {
      // Filter successful file uploads (only files with SUCCESSFUL status)
      const successfulFileUploads = files.filter((file) => {
        const status = fileUploadStatuses.get(file.name);
        return status === FileUploadStatus.SUCCESSFUL;
      });

      if (successfulFileUploads.length === 0) {
        console.warn('No successfully uploaded files to process');
        setIsUploading(false);
        return;
      }

      // Construct file URLs from tmp directory
      const filesToUpload = successfulFileUploads.map((file) => {
        if (!tempFilesMountUrl) {
          throw new Error('Temporary mount URL is not available');
        }

        return `${tempFilesMountUrl}${sanitizeFileName(file.name)}`;
      });

      // Format tags: convert from form format to API format
      const tagsSpec = Array.isArray(tags)
        ? tags
            .filter((tag) => tag.tagValue?.trim() && tag.tagType?.trim())
            .map((tag) => ({
              label: tag.tagValue.trim(),
              categoryLabel: tag.tagType.trim(),
              metadataType: 'MANUAL' as const,
            }))
        : [];

      // Prepare collectionWithFilesMap
      const collectionWithFilesMap = {
        collection: sourceDirectory ? { id: sourceDirectory } : null,
        files: filesToUpload,
      };

      const uploadedFiles = await uploadToSourceCollection({
        collectionWithFilesMap,

        /*
         * Do not stamp a transient status here. The upload helper would mark files as `Chunking`,
         * a label the Doc AI pipeline never legitimately produces (DOCAI-260). When auto-index is on,
         * processSourceFilesWithPipeline (below) starts the pipeline, which sets the correct
         * intermediate status (`Processing` for Doc AI) itself.
         */
        transitionToChunking: false,
        tags: tagsSpec,
      });

      handleClose();

      /*
       * Start processing BEFORE refreshing the grid, using the SAME path as the grid's "Process"
       * action (`addSourceFilesToIndex`): transition the files to `Processing` FIRST, then call
       * `processWithPipeline`. Calling `processWithPipeline` alone does NOT move a freshly-uploaded
       * `Not Indexed` file out of that state (verified server-side — it stays `Not Indexed`), which is
       * why auto-indexed uploads were stranding on "Unprocessed". The explicit transition puts the file
       * into a polling status so the subsequent onUpload refresh keeps polling it through to Indexed.
       */
      if (automaticallyUpdateIndex && uploadedFiles) {
        try {
          const uploadedIds = (uploadedFiles as Array<{ id?: unknown }>)
            .map((f) => (f && typeof f.id === 'string' ? f.id : null))
            .filter((id): id is string => id !== null && id.trim().length > 0);
          await addSourceFilesToIndex(uploadedIds);
        } catch (processError) {
          console.error('Error processing files for indexing:', processError);
        }
      }

      onUpload({ files, sourceDirectory, automaticallyUpdateIndex, tags });

      deleteFilesBatch(filesToUpload).catch((cleanupError) => {
        console.error('Error cleaning up temporary files:', cleanupError);
      });
    } catch (error) {
      console.error('Upload error:', error);

      // The error will be displayed to the user, and they can retry or close manually
      setIsUploading(false);
    }
  };

  const handleClose = async () => {
    if (files.length > 0 && tempFilesMountUrl) {
      const allFileNames = files.map((file) => file.name);
      await cleanupTmpFiles(allFileNames);
    }

    setFiles([]);
    setFileStatuses(new Map());
    setFileUploadStatuses(new Map());
    setTempFilesMountUrl(null);
    setSourceDirectory(null);
    setAutomaticallyUpdateIndex(true);
    setTags([]);
    setIsUploading(false);
    setDuplicateWarning({ status: '', title: '', subtitle: '' });
    onClose();
  };

  const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  /*
   * True while one or more selected files are still being uploaded to the temp mount
   * (per-file status PENDING/UPLOADING). handleUpload only processes files already marked
   * SUCCESSFUL, so the submit button must stay disabled until every file finishes uploading —
   * otherwise clicking "Upload" while a file is still transferring silently skips it.
   */
  const hasFilesUploadingToTmp = Array.from(fileUploadStatuses.values()).some(
    (status) => status === FileUploadStatus.PENDING || status === FileUploadStatus.UPLOADING
  );
  const isBusy = isUploading || hasFilesUploadingToTmp;

  return (
    <div
      className="bg-overlay fixed inset-0 z-modal flex items-center justify-center"
      role="button"
      tabIndex={0}
      aria-label={t('common.modalBackdrop')}
      onClick={handleClose}
      onKeyDown={handleBackdropKeyDown}
    >
      <div
        className="bg-primary rounded-sm shadow-menu"
        style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflow: 'auto' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <h2 id="upload-modal-title" className="text-lg font-semibold text-primary">
            {t('documents.upload.title')}
          </h2>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-6 h-6 text-secondary hover:text-primary transition-colors"
            aria-label={t('common.closeModal')}
          >
            <X className="text-lg" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* File Upload Section */}
          <FileUploadSection onFileSelect={handleFileSelect} selectedFiles={files} />

          {/* Source Directory */}
          <div>
            <label htmlFor="source-directory-select" className="block text-sm font-medium mb-2 text-primary">
              {t('documents.upload.sourceDirectoryLabel')}
            </label>
            <div className="relative">
              <button
                id="source-directory-select"
                type="button"
                className={`flex h-[38px] w-full cursor-pointer items-center gap-2 rounded-xs border bg-primary px-3 py-2 text-sm text-primary transition-colors hover:border-accent ${
                  isDropdownOpen ? 'border-accent' : 'border-weak'
                }`}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsDropdownOpen(!isDropdownOpen);
                  }
                }}
                aria-expanded={isDropdownOpen}
                aria-haspopup="listbox"
              >
                <Search className="text-secondary text-sm flex-shrink-0" size={14} />
                <span className={`flex-1 text-left ${sourceDirectory ? 'text-primary' : 'text-secondary'}`}>
                  {sourceDirectoryOptions.find((opt) => opt.id === sourceDirectory)?.name ||
                    t('documents.upload.selectPlaceholder')}
                </span>
                <ChevronDown
                  className={`text-secondary text-xs transition-transform flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`}
                  size={12}
                />
              </button>

              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsDropdownOpen(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsDropdownOpen(false);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={t('common.closeDropdown')}
                  />
                  <div
                    className="bg-menu border-weak absolute top-full left-0 right-0 z-20 mt-1 flex max-h-60 flex-col overflow-hidden rounded-xs border shadow-menu"
                    role="listbox"
                  >
                    <div className="overflow-y-auto max-h-60">
                      {sourceDirectoryOptions.length > 0 ? (
                        sourceDirectoryOptions.map((option) => {
                          const isSelected = sourceDirectory === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                                isSelected ? 'bg-accent-weak text-accent' : 'text-primary hover:bg-hover'
                              }`}
                              onClick={() => {
                                setSourceDirectory(option.id);
                                setIsDropdownOpen(false);
                              }}
                            >
                              <span>{option.name}</span>
                              {isSelected && <Check className="text-accent flex-shrink-0" size={14} />}
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-sm text-secondary">{t('documents.upload.noResults')}</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Duplicate Warning */}
          {duplicateWarning.status === 'WARNING' && (
            <div className="bg-warning-weak border-warning rounded-xs border p-3">
              <div className="text-warning text-sm font-semibold">{duplicateWarning.title}</div>
              <div className="text-warning mt-1 text-sm">{duplicateWarning.subtitle}</div>
            </div>
          )}

          {/* Automatically Update Processed Documents Toggle */}
          <div className="flex items-center justify-between">
            <label htmlFor="auto-update-index-toggle" className="text-sm font-medium text-primary">
              {t('documents.upload.autoUpdateIndex')}
            </label>
            <div className="flex items-center gap-2">
              <button
                id="auto-update-index-toggle"
                type="button"
                role="switch"
                aria-checked={automaticallyUpdateIndex}
                onClick={() => setAutomaticallyUpdateIndex(!automaticallyUpdateIndex)}
                className={`relative inline-flex h-[20px] w-[36px] items-center rounded-full p-[2px] transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
                  automaticallyUpdateIndex ? 'bg-accent' : 'bg-tertiary'
                }`}
              >
                <span
                  className="inline-block h-[16px] w-[16px] rounded-full bg-primary shadow-light-01 transition-transform duration-200 ease-in-out"
                  style={{
                    transform: automaticallyUpdateIndex ? 'translateX(16px)' : 'translateX(0)',
                  }}
                />
              </button>
              <span className="text-primary min-w-[24px] text-sm">
                {automaticallyUpdateIndex ? t('documents.upload.toggleOn') : t('documents.upload.toggleOff')}
              </span>
            </div>
          </div>

          {/* Tags Section (conditional - only show if source directory is available) */}
          {hasSourceDirectory && (
            <div>
              {!showTagForm ? (
                <div className="flex items-center gap-3 mb-3">
                  <label htmlFor="add-tag-button" className="text-sm font-medium text-primary">
                    {t('documents.upload.tagsOptional')}
                  </label>
                  <button
                    id="add-tag-button"
                    aria-label={t('documents.upload.addTagAria')}
                    onClick={() => {
                      if (files.length > 0) {
                        setShowTagForm(true);
                      }
                    }}
                    disabled={files.length === 0}
                    className="bg-accent rounded-xs px-4 py-2 text-sm font-medium text-inverse transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('documents.upload.addTag')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="tag-type-input" className="text-secondary mb-1.5 block text-sm font-medium">
                        {t('documents.upload.tagTypeLabel')}
                      </label>
                      <input
                        id="tag-type-input"
                        type="text"
                        value={tagFormValues.tagType}
                        onChange={(e) => setTagFormValues({ ...tagFormValues, tagType: e.target.value })}
                        placeholder={t('documents.upload.tagTypePlaceholder')}
                        className="border-weak bg-primary w-full rounded-xs border px-3 py-2 text-sm text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label htmlFor="tag-value-input" className="text-secondary mb-1.5 block text-sm font-medium">
                        {t('documents.upload.tagValueLabel')}
                      </label>
                      <input
                        id="tag-value-input"
                        type="text"
                        value={tagFormValues.tagValue}
                        onChange={(e) => setTagFormValues({ ...tagFormValues, tagValue: e.target.value })}
                        placeholder={t('documents.upload.tagValuePlaceholder')}
                        className="border-weak bg-primary w-full rounded-xs border px-3 py-2 text-sm text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setShowTagForm(false);
                        setTagFormValues({ tagValue: '', tagType: '' });
                      }}
                      className="border-accent text-accent rounded-xs border px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-inverse focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddTag}
                      disabled={!tagFormValues.tagValue?.trim() || !tagFormValues.tagType?.trim()}
                      className="bg-accent rounded-xs px-4 py-2 text-sm font-medium text-inverse transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('documents.upload.addTag')}
                    </button>
                  </div>
                </div>
              )}
              <TagsSection tags={tags} onChange={setTags} />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 p-4">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="border-accent text-accent rounded-xs border px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-inverse focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || isBusy}
            className="bg-accent rounded-xs px-4 py-2 text-sm font-medium text-inverse transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-inverse"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('documents.upload.uploading')}
              </span>
            ) : (
              t('documents.upload.upload')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export { UploadDocumentsModal };
export type { UploadFormData };
