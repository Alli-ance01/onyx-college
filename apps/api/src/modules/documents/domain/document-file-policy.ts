import { ValidationError } from '../../../app/errors/app-error.js';
import type { DocumentStorageResourceType } from '../application/document-storage.js';

const supportedFiles = {
  'application/pdf': { extension: 'pdf', resourceType: 'raw' },
  'image/jpeg': { extension: 'jpg', resourceType: 'image' },
  'image/png': { extension: 'png', resourceType: 'image' },
} as const satisfies Record<
  string,
  { extension: string; resourceType: DocumentStorageResourceType }
>;

export type SupportedDocumentMimeType = keyof typeof supportedFiles;

export function isSupportedDocumentMimeType(value: string): value is SupportedDocumentMimeType {
  return Object.hasOwn(supportedFiles, value);
}

export function documentExtensionFor(mimeType: string): string {
  if (!isSupportedDocumentMimeType(mimeType))
    throw new ValidationError('This file type is not supported.');
  return supportedFiles[mimeType].extension;
}

export function documentResourceTypeFor(mimeType: string): DocumentStorageResourceType {
  if (!isSupportedDocumentMimeType(mimeType))
    throw new ValidationError('This file type is not supported.');
  return supportedFiles[mimeType].resourceType;
}

export function detectDocumentMimeType(body: Buffer): SupportedDocumentMimeType | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)
    return 'image/jpeg';
  if (
    body.length >= 8 &&
    body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (body.length >= 5 && body.subarray(0, 5).toString('ascii') === '%PDF-')
    return 'application/pdf';
  return null;
}

export function sanitizeDocumentFilename(value: string): string {
  const sanitized = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .trim()
    .slice(0, 160);
  return sanitized === '' ? 'document' : sanitized;
}

export function validateDocumentUpload(input: {
  acceptedMimeTypes: readonly string[];
  body: Buffer;
  declaredMimeType: string;
  maximumBytes: number;
}): SupportedDocumentMimeType {
  if (input.body.length === 0 || input.body.length > input.maximumBytes)
    throw new ValidationError('The file is empty or exceeds the allowed size.');
  const detectedMimeType = detectDocumentMimeType(input.body);
  if (
    detectedMimeType === null ||
    detectedMimeType !== input.declaredMimeType ||
    !input.acceptedMimeTypes.includes(detectedMimeType)
  )
    throw new ValidationError('The file content does not match an accepted file type.');
  return detectedMimeType;
}
