import { describe, expect, it } from 'vitest';

import {
  detectDocumentMimeType,
  documentResourceTypeFor,
  sanitizeDocumentFilename,
  validateDocumentUpload,
} from '../src/modules/documents/domain/document-file-policy.js';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

describe('document file policy', () => {
  it('detects supported content and maps documents to safe provider resource types', () => {
    expect(detectDocumentMimeType(png)).toBe('image/png');
    expect(documentResourceTypeFor('image/png')).toBe('image');
    expect(documentResourceTypeFor('application/pdf')).toBe('raw');
  });

  it('rejects a declared MIME type that does not match the file signature or requirement', () => {
    expect(() =>
      validateDocumentUpload({
        acceptedMimeTypes: ['image/jpeg'],
        body: png,
        declaredMimeType: 'image/png',
        maximumBytes: 1024,
      }),
    ).toThrow(/accepted file type/iu);
    expect(() =>
      validateDocumentUpload({
        acceptedMimeTypes: ['image/png'],
        body: png,
        declaredMimeType: 'application/pdf',
        maximumBytes: 1024,
      }),
    ).toThrow(/accepted file type/iu);
  });

  it('rejects empty and oversized files before provider upload', () => {
    expect(() =>
      validateDocumentUpload({
        acceptedMimeTypes: ['image/png'],
        body: Buffer.alloc(0),
        declaredMimeType: 'image/png',
        maximumBytes: 1024,
      }),
    ).toThrow(/empty or exceeds/iu);
    expect(() =>
      validateDocumentUpload({
        acceptedMimeTypes: ['image/png'],
        body: png,
        declaredMimeType: 'image/png',
        maximumBytes: png.length - 1,
      }),
    ).toThrow(/empty or exceeds/iu);
  });

  it('removes control characters without allowing an empty display filename', () => {
    expect(sanitizeDocumentFilename('birth\u0000 certificate.pdf')).toBe('birth certificate.pdf');
    expect(sanitizeDocumentFilename('\u0000\u0001')).toBe('document');
  });
});
