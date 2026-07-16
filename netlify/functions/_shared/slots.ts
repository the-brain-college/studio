/**
 * The YouTube slot law (from the manual-account scheduling handoff, unchanged):
 * three slots per day at 02:00 / 15:00 / 20:00 Europe/Lisbon (indices 0/1/2), each with a few
 * minutes of jitter, never a round minute. A new video always takes the next grid position AFTER
 * the latest existing schedule (by canonical slot position, never by jittered instant), advanced
 * until its base time is comfortably in the future. Missed windows roll to the next proper slot.
 */

export const SLOT_HOURS = [2, 15, 20] as const
export const LEAD_MS = 45 * 60 * 1000 // future-publishAt margin: upload time + jitter's -10min extreme
const JITTER_MAX_S = 600

export interface SlotPos {
  slotDate: string // YYYY-MM-DD (Lisbon calendar date)
  slotIndex: 0 | 1 | 2
}

export interface PlannedSlot extends SlotPos {
  publishAt: Date // jittered instant (UTC)
}

/** Wall-clock Y/M/D in Lisbon for an instant. */
function lisbonDateParts(d: Date): { y: number; m: number; day: number } {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
  const [y, m, day] = s.split('-').map(Number)
  return { y, m, day }
}

/**
 * The UTC instant of a Lisbon wall time (DST-correct, no hardcoded offsets):
 * guess UTC = wall time, read back what Lisbon wall-clock that guess renders as,
 * and correct by the difference. One iteration settles WET/WEST (±1h zones).
 */
export function lisbonWallToUtc(y: number, m: number, day: number, hour: number, min = 0, sec = 0): Date {
  let guess = Date.UTC(y, m - 1, day, hour, min, sec)
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(guess))
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
    const rendered = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
    const want = Date.UTC(y, m - 1, day, hour, min, sec)
    const diff = want - rendered
    if (diff === 0) break
    guess += diff
  }
  return new Date(guess)
}

function slotBaseUtc(pos: SlotPos): Date {
  const [y, m, day] = pos.slotDate.split('-').map(Number)
  return lisbonWallToUtc(y, m, day, SLOT_HOURS[pos.slotIndex])
}

export function nextPos(pos: SlotPos): SlotPos {
  if (pos.slotIndex < 2) return { slotDate: pos.slotDate, slotIndex: (pos.slotIndex + 1) as 1 | 2 }
  const [y, m, day] = pos.slotDate.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, day + 1))
  const iso = next.toISOString().slice(0, 10)
  return { slotDate: iso, slotIndex: 0 }
}

/** First grid position whose base time is >= t. */
export function firstPosAtOrAfter(t: Date): SlotPos {
  const { y, m, day } = lisbonDateParts(t)
  let pos: SlotPos = { slotDate: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, slotIndex: 0 }
  for (let i = 0; i < 5; i++) {
    if (slotBaseUtc(pos).getTime() >= t.getTime()) return pos
    pos = nextPos(pos)
  }
  return pos
}

/**
 * Deterministic jitter in (0, JITTER_MAX_S] seconds derived from the schedule identity, so a
 * retried request reproduces the same instant. Never lands on an exact round minute.
 */
export function jitterSeconds(seedText: string): number {
  let h = 2166136261
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const s = (Math.abs(h) % JITTER_MAX_S) + 1
  return s % 60 === 0 ? s + 7 : s
}

/**
 * Plan the next slot: strictly after the anchor (the latest existing canonical position),
 * and with a base time at least LEAD_MS in the future.
 */
export function planNextSlot(anchor: SlotPos | null, now: Date, seedText: string): PlannedSlot {
  let pos = anchor ? nextPos(anchor) : firstPosAtOrAfter(new Date(now.getTime() + LEAD_MS))
  while (slotBaseUtc(pos).getTime() < now.getTime() + LEAD_MS) pos = nextPos(pos)
  const publishAt = new Date(slotBaseUtc(pos).getTime() + jitterSeconds(`${seedText}|${pos.slotDate}|${pos.slotIndex}`) * 1000)
  return { ...pos, publishAt }
}
