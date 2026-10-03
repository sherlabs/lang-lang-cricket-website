import type { CollectionConfig } from 'payload'
import { DOCUMENT_CATEGORIES } from '../../lib/documents'
import { anyone, isStaff } from '../access'
import { clientUploadInMemory } from '../hooks/clientUploadInMemory'
import { sharedLegacyUrlField, legacyUrlWinsOnRead, maxFileSize, refuseLegacyFileReplace } from '../hooks/legacyUrl'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

const PATHS = ['/documents']

/** PDFs on /documents (spec §3.3) ← `public.documents`. Storage prefix `documents`. */
export const Documents: CollectionConfig = {
  slug: 'documents',
  labels: { singular: 'Document', plural: 'Documents' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'title',
    defaultColumns: ['title', 'category'],
    description: 'Forms, policies and newsletters that people can download from the Documents page. PDF files only.',
  },
  defaultSort: 'title',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  upload: {
    mimeTypes: ['application/pdf'],
    filesRequiredOnCreate: false,
    // ETL only (like allowIDOnCreate): Payload's PDF integrity check wants `%%EOF` + `xref` in
    // the last 1 KB, and some files the legacy site already serves have trailing bytes after
    // %%EOF (e.g. safeguarding-children-policy.pdf). The ETL imports them verbatim; admin
    // uploads keep the full check.
    allowRestrictedFileTypes: process.env.PAYLOAD_ETL === 'true',
  },
  hooks: {
    beforeOperation: [clientUploadInMemory(DOCUMENT_MAX_BYTES)],
    beforeValidate: [maxFileSize(DOCUMENT_MAX_BYTES)],
    beforeChange: [refuseLegacyFileReplace],
    afterRead: [legacyUrlWinsOnRead],
    afterChange: [revalidateAfterChange(PATHS)],
    afterDelete: [revalidateAfterDelete(PATHS)],
  },
  timestamps: true,
  fields: [
    {
      name: 'title',
      label: 'Document name',
      type: 'text',
      required: true,
      admin: { description: 'What people will see on the Documents page.', placeholder: 'e.g. Junior registration form 2026' },
    },
    {
      name: 'category',
      label: 'Section',
      type: 'select',
      required: true,
      options: [...DOCUMENT_CATEGORIES],
      admin: { description: 'Where on the Documents page this file is listed.' },
    },
    sharedLegacyUrlField,
  ],
}
