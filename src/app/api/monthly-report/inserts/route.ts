import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { resolveBusinessProfileIds } from '@/lib/business/resolveBusinessProfileIds'
import { withSchema, withQuerySchema } from '@/lib/api/with-schema'
import {
  INSERTS_NOT_SET_UP_REASON,
  MAX_INSERT_BYTES,
  REPORT_INSERTS_BUCKET,
  insertPlacements,
  insertStoragePath,
  insertTooLargeReason,
  isInsertsSchemaMissing,
  isValidReportMonth,
  isValidWidgetId,
} from '@/lib/monthly-report/pack-inserts'
import { INSERT_RECORD_COLUMNS, loadPackInsertRecords } from '@/lib/monthly-report/pack-inserts-load'
import { inspectInsertPdf } from '@/lib/monthly-report/pack-insert-pdf'

export const dynamic = 'force-dynamic'

/**
 * Uploaded pages (lib/monthly-report/pack-inserts): the month's PDF for an
 * "Uploaded page" placement in the pack's layout.
 *
 * GET  ?business_id&report_month  → the newest upload per placement, or
 *                                   status 'unavailable' with the reason
 * GET  ?business_id&id            → that upload's file (application/pdf), for
 *                                   the export to merge
 * POST multipart: file, business_id, report_month, widget_id
 *                                 → checks the file is a readable, unencrypted
 *                                   PDF within the limit, keeps it in the
 *                                   private bucket and records it. Replacing a
 *                                   month's file is another POST: readers take
 *                                   the newest row.
 *
 * The body is multipart, which withSchema's clone().json() cannot read — so the
 * wrapper's schema accepts anything, and the handler validates the form's
 * fields with UploadFieldsSchema itself (withSchema never hands a handler the
 * body; see payroll-grid, #528).
 */
const GetQuerySchema = z.object({
  business_id: z.string(),
  report_month: z.string().optional(),
  id: z.string().optional(),
})

const UploadFieldsSchema = z.object({
  business_id: z.string().uuid(),
  report_month: z.string().refine(isValidReportMonth, 'report_month must be YYYY-MM'),
  widget_id: z.string().refine(isValidWidgetId, 'widget_id is not a layout placement id'),
})

const PDF_TYPES = new Set(['application/pdf', 'application/x-pdf'])

type Authorised = { userId: string } | { block: NextResponse }

/** The monthly-report trio: a session, the finances section, and the business itself. */
async function authorise(businessId: string, routeId: string): Promise<Authorised> {
  const authClient = await createRouteHandlerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { block: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const verdict = await requireSectionPermission(authClient, user.id, businessId, 'finances')
  const blocked = enforceSectionPermission(verdict, 'finances', routeId, user.id, businessId)
  if (blocked) return { block: blocked }
  // The data client is service-role and bypasses RLS: this is the tenant gate.
  if (!(await verifyBusinessAccess(user.id, businessId))) {
    return { block: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')
    const reportMonth = searchParams.get('report_month')
    const id = searchParams.get('id')
    const idValid = id === null || z.string().uuid().safeParse(id).success
    if (!businessId || !idValid || (!id && !isValidReportMonth(reportMonth))) {
      return NextResponse.json({ error: 'business_id and report_month (YYYY-MM), or business_id and an upload id, are required' }, { status: 400 })
    }

    const auth = await authorise(businessId, 'api/monthly-report/inserts')
    if ('block' in auth) return auth.block

    const supabase = createServiceRoleClient()

    if (id) {
      const ids = await resolveBusinessProfileIds(supabase, businessId)
      const { data: row, error } = await supabase
        .from('monthly_report_inserts')
        .select(INSERT_RECORD_COLUMNS)
        .eq('id', id)
        .eq('business_id', ids.businessId)
        .maybeSingle()
      if (error) {
        if (isInsertsSchemaMissing(error)) return NextResponse.json({ error: INSERTS_NOT_SET_UP_REASON }, { status: 503 })
        throw error
      }
      if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const { data: blob, error: dlError } = await supabase.storage.from(REPORT_INSERTS_BUCKET).download(row.storage_path)
      if (dlError || !blob) {
        Sentry.captureException(dlError ?? new Error('empty download'), {
          tags: { route: 'monthly-report/inserts', invariant: 'pack-insert-download' },
          extra: { insertId: id, storagePath: row.storage_path },
        } as never)
        return NextResponse.json({ error: 'The uploaded file could not be read from storage' }, { status: 502 })
      }
      return new NextResponse(await blob.arrayBuffer(), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${String(row.filename).replace(/[^\w .()-]/g, '_')}"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const load = await loadPackInsertRecords(supabase, businessId, reportMonth!)
    if (load.status === 'unavailable') {
      return NextResponse.json({ success: true, status: 'unavailable', reason: load.reason })
    }
    return NextResponse.json({ success: true, status: 'ok', inserts: [...load.latest.values()] })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/inserts' }, extra: { context: '[Inserts] GET error' } } as never)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function postHandler(request: Request) {
  try {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Send the upload as multipart/form-data' }, { status: 400 })
    }
    const parsed = UploadFieldsSchema.safeParse({
      business_id: form.get('business_id'),
      report_month: form.get('report_month'),
      widget_id: form.get('widget_id'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 400 })
    }
    const { business_id, report_month, widget_id } = parsed.data

    const auth = await authorise(business_id, 'api/monthly-report/inserts')
    if ('block' in auth) return auth.block

    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Choose a PDF to upload' }, { status: 400 })
    }
    if (!PDF_TYPES.has(file.type)) {
      return NextResponse.json({ error: `The upload was refused: the file must be a PDF (this one is ${file.type || 'of an unknown type'}).` }, { status: 400 })
    }
    if (file.size > MAX_INSERT_BYTES) {
      return NextResponse.json({ error: `The upload was refused: ${insertTooLargeReason(file.size)}.` }, { status: 413 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const inspection = await inspectInsertPdf(bytes, { maxBytes: MAX_INSERT_BYTES })
    if (!inspection.ok) {
      return NextResponse.json(
        { error: `The upload was refused: ${inspection.reason}.`, kind: inspection.kind },
        { status: inspection.kind === 'too_large' ? 413 : 400 },
      )
    }

    const supabase = createServiceRoleClient()
    const ids = await resolveBusinessProfileIds(supabase, business_id)

    // Only a placement the business's SAVED layout has: a file against a page
    // still sitting unsaved in the editor would be kept against an id nothing
    // prints.
    const { data: settingsRows, error: settingsError } = await supabase
      .from('monthly_report_settings')
      .select('business_id, pdf_layout')
      .in('business_id', ids.all)
    if (settingsError) throw settingsError
    const settings = (settingsRows ?? []).find((r: { business_id: string }) => r.business_id === ids.businessId) ?? settingsRows?.[0]
    const placement = insertPlacements(settings?.pdf_layout).find((p) => p.widgetId === widget_id)
    if (!placement) {
      return NextResponse.json({ error: "That uploaded page isn't in this business's saved layout. Save the layout, then upload." }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const storagePath = insertStoragePath(ids.businessId, report_month, widget_id, id)
    const bucket = supabase.storage.from(REPORT_INSERTS_BUCKET)
    const { error: uploadError } = await bucket.upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })
    if (uploadError) {
      if (/bucket not found/i.test(uploadError.message ?? '')) {
        return NextResponse.json({ error: `The upload was refused: ${INSERTS_NOT_SET_UP_REASON}.` }, { status: 503 })
      }
      Sentry.captureException(uploadError, {
        tags: { route: 'monthly-report/inserts', invariant: 'pack-insert-upload' },
        extra: { businessId: ids.businessId, report_month, widget_id },
      } as never)
      return NextResponse.json({ error: 'The file could not be stored — try again' }, { status: 500 })
    }

    const filename = (file.name || 'upload.pdf').trim().slice(0, 200)
    const { data: row, error: insertError } = await supabase
      .from('monthly_report_inserts')
      .insert({
        id,
        business_id: ids.businessId,
        report_month,
        widget_id,
        label: placement.label,
        storage_path: storagePath,
        filename,
        page_count: inspection.pageCount,
        size_bytes: bytes.length,
        uploaded_by: auth.userId,
      })
      .select(INSERT_RECORD_COLUMNS)
      .single()
    if (insertError) {
      // Unrecorded, the object is unreachable: take it back out.
      const { error: removeError } = await bucket.remove([storagePath])
      if (removeError) {
        Sentry.captureException(removeError, {
          tags: { route: 'monthly-report/inserts', invariant: 'pack-insert-orphan' },
          extra: { storagePath },
        } as never)
      }
      if (isInsertsSchemaMissing(insertError)) {
        return NextResponse.json({ error: `The upload was refused: ${INSERTS_NOT_SET_UP_REASON}.` }, { status: 503 })
      }
      Sentry.captureException(insertError, {
        tags: { route: 'monthly-report/inserts', invariant: 'pack-insert-record' },
        extra: { businessId: ids.businessId, report_month, widget_id },
      } as never)
      return NextResponse.json({ error: 'The upload could not be recorded — try again' }, { status: 500 })
    }

    return NextResponse.json({ success: true, insert: row })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'monthly-report/inserts' }, extra: { context: '[Inserts] POST error' } } as never)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withQuerySchema('monthly-report/inserts', GetQuerySchema, getHandler)
// Multipart: validated in the handler (UploadFieldsSchema), not by the wrapper.
export const POST = withSchema('monthly-report/inserts', z.any(), postHandler)
