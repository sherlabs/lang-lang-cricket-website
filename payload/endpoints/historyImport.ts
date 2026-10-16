import type { Endpoint } from 'payload'
import { applyImport, exportMatchRows, exportSeasonTotals, listImportBatches, planImport, previewOf, undoImportBatch } from '../../lib/history-import/server'
import { isImportKind, templateCsv } from '../../lib/history-import/templates'
import { fail, readJson, refuseNonAdmin } from './adminOnly'

const csvResponse = (body: string, filename: string) =>
  new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } })

/**
 * Historical CSV import and export (W2 spec 6.1, issue #9). Every endpoint is admin only. The CSV travels as text in a JSON
 * body (`{ kind, csv, createUnknown, fileHash }`), at most 2 MB, so it is easy to test and to drive from the admin view.
 */
export const historyImportEndpoints: Endpoint[] = [
  {
    path: '/history-import/template/:kind',
    method: 'get',
    handler: async (req) => {
      const refused = refuseNonAdmin(req)
      if (refused) return refused
      const kind = req.routeParams?.kind
      if (!isImportKind(kind)) return fail(404, 'Unknown template.')
      return csvResponse(templateCsv(kind), `history-import-${kind}-template.csv`)
    },
  },
  {
    path: '/history-import/preview',
    method: 'post',
    handler: async (req) => {
      const refused = refuseNonAdmin(req)
      if (refused) return refused
      const body = await readJson(req)
      if (!isImportKind(body.kind) || typeof body.csv !== 'string') return fail(400, 'Choose what you are importing and attach a file.')
      const res = await planImport(req.payload, body.kind, body.csv, body.createUnknown === true)
      if (!res.ok) return fail(400, res.error)
      return Response.json(previewOf(res))
    },
  },
  {
    path: '/history-import/apply',
    method: 'post',
    handler: async (req) => {
      const refused = refuseNonAdmin(req)
      if (refused) return refused
      const body = await readJson(req)
      if (!isImportKind(body.kind) || typeof body.csv !== 'string') return fail(400, 'Choose what you are importing and attach a file.')
      // The hash of the previewed file is required: an API client cannot skip the "this is the file you looked at" check.
      if (typeof body.fileHash !== 'string' || !body.fileHash) return fail(400, 'Preview the file first, then import it with the fileHash the preview returned.')
      const res = await applyImport(req.payload, body.kind, body.csv, { createUnknown: body.createUnknown === true, expectedHash: body.fileHash })
      if (!res.ok) return fail(400, res.error)
      return Response.json(res)
    },
  },
  {
    path: '/history-import/undo-batch',
    method: 'post',
    handler: async (req) => {
      const refused = refuseNonAdmin(req)
      if (refused) return refused
      const body = await readJson(req)
      if (typeof body.batch !== 'string') return fail(400, 'Say which import to undo.')
      try {
        return Response.json({ ok: true, ...(await undoImportBatch(req.payload, body.batch)) })
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : 'Could not undo that import.')
      }
    },
  },
  {
    path: '/history-import/batches',
    method: 'get',
    handler: async (req) => {
      const refused = refuseNonAdmin(req)
      if (refused) return refused
      return Response.json({ batches: await listImportBatches(req.payload) })
    },
  },
  {
    path: '/history-import/export/:kind',
    method: 'get',
    handler: async (req) => {
      const refused = refuseNonAdmin(req)
      if (refused) return refused
      const kind = req.routeParams?.kind
      if (!isImportKind(kind)) return fail(404, 'Unknown export.')
      return csvResponse(kind === 'season-totals' ? await exportSeasonTotals(req.payload) : await exportMatchRows(req.payload), `history-${kind}.csv`)
    },
  },
]
