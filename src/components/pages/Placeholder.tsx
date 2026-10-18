import '@/components/pages/pages.css'

interface PlaceholderProps {
  purpose: string
  planned: string[]
}

/** Stand-in for sections not built yet; lists what the spec plans for them. */
export function Placeholder({ purpose, planned }: PlaceholderProps) {
  return (
    <section className="tt-card tt-placeholder">
      <p className="tt-placeholder-purpose">{purpose}</p>
      <h2>Planned</h2>
      <ul>
        {planned.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
