/**
 * Admin Bank Statement Import Endpoint
 * POST /api/admin/billing/bank-import - Import a Barclays CSV
 * Requires: billing.view permission
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withPermission, PermissionContext } from '../../../middleware/permission'
import { PERMISSIONS } from '../../../lib/permissions'

interface BarclaysRow {
  Number: string
  Date: string
  Account: string
  Amount: string
  Subcategory: string
  Memo: string
}

interface BankImportBody {
  club_id: string
  filename: string
  account?: string
  rows: BarclaysRow[]
}

interface BankImportResponse {
  import_id: string
  inserted: number
  skipped_duplicates: number
  total_rows: number
}

// Parse DD/MM/YYYY to YYYY-MM-DD
function parseDateDMY(dateStr: string): string {
  const parts = dateStr.split('/')
  if (parts.length !== 3) return dateStr
  const [day, month, year] = parts
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

// Generate fingerprint for deduplication
async function generateFingerprint(
  account: string,
  date: string,
  amountCents: number,
  memo: string,
  txnNumber: string
): Promise<string> {
  const data = `${account}|${date}|${amountCents}|${memo}|${txnNumber}`
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export const onRequestPost: PagesFunction<Env> = withPermission(PERMISSIONS.BILLING_VIEW)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB
    const { clubId, person } = auth

  try {
    const body = await context.request.json() as BankImportBody

    if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return errorResponse('rows array is required and must not be empty', 400)
    }

    const importId = crypto.randomUUID()
    const filename = body.filename || 'unknown.csv'

    // Extract account mask from first row
    const firstRow = body.rows[0]
    const accountMask = body.account || firstRow?.Account || null

    // Create import record
    await db
      .prepare(`
        INSERT INTO bank_statement_imports (
          id, club_id, source, account_mask, filename,
          uploaded_by_person_id, status, row_count
        )
        VALUES (?, ?, 'barclays_csv', ?, ?, ?, 'processed', ?)
      `)
      .bind(importId, clubId, accountMask, filename, person.id, body.rows.length)
      .run()

    let inserted = 0
    let skipped = 0

    for (const row of body.rows) {
      try {
        const txnDate = parseDateDMY(row.Date)
        const amountFloat = parseFloat(row.Amount)
        if (isNaN(amountFloat)) {
          console.warn(`Skipping row with invalid amount: ${row.Amount}`)
          skipped++
          continue
        }

        const amountCents = Math.round(amountFloat * 100)
        const direction = amountCents >= 0 ? 'in' : 'out'

        const fingerprint = await generateFingerprint(
          row.Account || '',
          txnDate,
          amountCents,
          row.Memo || '',
          row.Number || ''
        )

        const rowId = crypto.randomUUID()

        // Try to insert, skip if fingerprint already exists
        const result = await db
          .prepare(`
            INSERT OR IGNORE INTO bank_statement_rows (
              id, import_id, txn_number, txn_date, account,
              amount_cents, subcategory, memo, direction, fingerprint
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            rowId,
            importId,
            row.Number || null,
            txnDate,
            row.Account || null,
            amountCents,
            row.Subcategory || null,
            row.Memo || null,
            direction,
            fingerprint
          )
          .run()

        if (result.meta.changes > 0) {
          inserted++
        } else {
          skipped++
        }
      } catch (rowError) {
        console.error('Error processing row:', rowError)
        skipped++
      }
    }

    // Update actual row count
    await db
      .prepare('UPDATE bank_statement_imports SET row_count = ? WHERE id = ?')
      .bind(inserted, importId)
      .run()

    const response: BankImportResponse = {
      import_id: importId,
      inserted,
      skipped_duplicates: skipped,
      total_rows: body.rows.length,
    }

    return jsonResponse(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
