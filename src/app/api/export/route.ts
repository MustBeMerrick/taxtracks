import { NextResponse } from 'next/server'
import { hasValidSession } from '@/lib/auth/session'
import { getRepository } from '@/lib/data'

export const dynamic = 'force-dynamic'

/** Downloads every record as a JSON backup (Settings › Data › Export). */
export async function GET() {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const file = getRepository().exportAll()
  return new NextResponse(JSON.stringify(file, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="taxtracks-backup-${new Date().toLocaleDateString('en-CA')}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
