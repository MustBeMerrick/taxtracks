export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss'

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  mfj: 'Married Filing Jointly',
  mfs: 'Married Filing Separately',
  hoh: 'Head of Household',
  qss: 'Qualifying Surviving Spouse',
}
