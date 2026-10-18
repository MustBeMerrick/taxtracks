import { notFound } from 'next/navigation'
import BrandPreview from '@/components/pages/BrandPreview'

// Brand, token and icon reference sheet; development only.
export default function BrandPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <BrandPreview />
}
