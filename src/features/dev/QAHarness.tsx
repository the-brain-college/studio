import { useState } from 'react'

/* ————— Responsive QA harness (dev tool) —————
   Renders any studio route inside fixed-width iframes at phone / tablet / desktop widths so the
   real mobile media queries apply — the reliable way to eyeball responsive layout without a
   device. Same-origin (X-Frame-Options: SAMEORIGIN in server.mjs) means the iframes share the
   auth session, so they show real data. Reachable at /__qa on the deployed studio.
   Note: touch-only affordances (`no-hover:` styles) still won't show here because the host is a
   pointer device — those need a real phone. Everything layout/overflow/size-related shows true. */

const ROUTES = ['/videos', '/production', '/calendar', '/feedback', '/analytics', '/story']
const FRAMES: Array<[number, number, string]> = [
  [390, 780, 'Phone'],
  [768, 800, 'Tablet'],
  [1280, 860, 'Desktop'],
]

export function QAHarness() {
  const [route, setRoute] = useState('/videos')
  const [input, setInput] = useState('/videos')

  return (
    <div style={{ minHeight: '100vh', background: '#151719', color: '#e8eaed', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, background: '#0b0d10', borderBottom: '1px solid #262b33' }}>
        <strong style={{ fontSize: 13 }}>Responsive QA</strong>
        <form
          onSubmit={(e) => { e.preventDefault(); setRoute(input.startsWith('/') ? input : '/' + input) }}
          style={{ display: 'flex', gap: 6 }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="/videos/some-slug"
            style={{ background: '#1a1e25', color: '#e8eaed', border: '1px solid #333a45', borderRadius: 6, padding: '5px 9px', fontSize: 13, width: 260 }}
          />
          <button type="submit" style={{ background: '#2dd4bf', color: '#04211d', border: 0, borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Go</button>
        </form>
        {ROUTES.map((r) => (
          <button
            key={r}
            onClick={() => { setRoute(r); setInput(r) }}
            style={{ background: route === r ? '#2dd4bf' : '#1a1e25', color: route === r ? '#04211d' : '#9aa3ae', border: '1px solid #333a45', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            {r}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7480' }}>rendering <code style={{ color: '#9aa3ae' }}>{route}</code></span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, padding: 24, alignItems: 'flex-start' }}>
        {FRAMES.map(([w, h, label]) => (
          <div key={label}>
            <div style={{ fontSize: 12, marginBottom: 8, color: '#9aa3ae', fontWeight: 600 }}>{label} · {w}px</div>
            <iframe
              title={`${label} ${w}`}
              src={route}
              width={w}
              height={h}
              style={{ border: '1px solid #333a45', borderRadius: 8, background: '#0b0d10' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
