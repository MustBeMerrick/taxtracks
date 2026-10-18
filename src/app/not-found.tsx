import Link from 'next/link'
import { Card } from '@/components/ui/Card'

export default function NotFound() {
  return (
    <main className="tt-main">
      <Card title="Page not found">
        <p>
          <Link href="/">Back to the Overview</Link>
        </p>
      </Card>
    </main>
  )
}
