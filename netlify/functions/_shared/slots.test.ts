import { describe, expect, it } from 'vitest'
import { LEAD_MS, firstPosAtOrAfter, jitterSeconds, lisbonWallToUtc, nextPos, planNextSlot } from './slots'

describe('lisbonWallToUtc (DST-correct)', () => {
  it('winter (WET = UTC+0): 15:00 Lisbon is 15:00 UTC', () => {
    expect(lisbonWallToUtc(2026, 1, 15, 15).toISOString()).toBe('2026-01-15T15:00:00.000Z')
  })
  it('summer (WEST = UTC+1): 15:00 Lisbon is 14:00 UTC', () => {
    expect(lisbonWallToUtc(2026, 7, 22, 15).toISOString()).toBe('2026-07-22T14:00:00.000Z')
  })
  it('handles the spring-forward day', () => {
    // 2026 EU DST starts Sun 2026-03-29; 15:00 that day is WEST (UTC+1)
    expect(lisbonWallToUtc(2026, 3, 29, 15).toISOString()).toBe('2026-03-29T14:00:00.000Z')
  })
})

describe('grid walking', () => {
  it('advances within a day then rolls to the next day', () => {
    expect(nextPos({ slotDate: '2026-07-22', slotIndex: 0 })).toEqual({ slotDate: '2026-07-22', slotIndex: 1 })
    expect(nextPos({ slotDate: '2026-07-22', slotIndex: 2 })).toEqual({ slotDate: '2026-07-23', slotIndex: 0 })
  })
  it('finds the first position at/after an instant', () => {
    // 16:00 Lisbon on Jul 22 → next base is 20:00 same day
    const t = lisbonWallToUtc(2026, 7, 22, 16)
    expect(firstPosAtOrAfter(t)).toEqual({ slotDate: '2026-07-22', slotIndex: 2 })
  })
})

describe('jitter', () => {
  it('is deterministic and never a round minute', () => {
    const a = jitterSeconds('reel-x|2026-07-22|1')
    expect(a).toBe(jitterSeconds('reel-x|2026-07-22|1'))
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThanOrEqual(607)
    expect(a % 60).not.toBe(0)
  })
})

describe('planNextSlot (the continuation law)', () => {
  const now = lisbonWallToUtc(2026, 7, 22, 10) // 10:00 Lisbon

  it('continues strictly after the anchor', () => {
    const plan = planNextSlot({ slotDate: '2026-07-25', slotIndex: 1 }, now, 'reel-a')
    expect(plan.slotDate).toBe('2026-07-25')
    expect(plan.slotIndex).toBe(2)
  })
  it('anchor in the past → rolls forward to the first valid future slot, never a catch-up time', () => {
    const plan = planNextSlot({ slotDate: '2026-07-20', slotIndex: 2 }, now, 'reel-b')
    // next after anchor would be Jul 21 02:00 — in the past → advance to today 15:00
    expect(plan.slotDate).toBe('2026-07-22')
    expect(plan.slotIndex).toBe(1)
    expect(plan.publishAt.getTime()).toBeGreaterThan(now.getTime() + LEAD_MS - 1)
  })
  it('no anchor → first slot comfortably in the future', () => {
    const plan = planNextSlot(null, now, 'reel-c')
    expect(plan.slotDate).toBe('2026-07-22')
    expect(plan.slotIndex).toBe(1) // 15:00; 10:00+45min < 15:00
  })
  it('lead-time pushes past a too-close slot', () => {
    const nearNoon = lisbonWallToUtc(2026, 7, 22, 14, 30) // 14:30; 15:00 base is < 45min away
    const plan = planNextSlot(null, nearNoon, 'reel-d')
    expect(plan.slotIndex).toBe(2) // 20:00
  })
  it('publishAt sits within (0, 10min] after the base, off round minutes', () => {
    const plan = planNextSlot({ slotDate: '2026-07-25', slotIndex: 0 }, now, 'reel-e')
    const base = lisbonWallToUtc(2026, 7, 25, 15).getTime()
    const delta = (plan.publishAt.getTime() - base) / 1000
    expect(delta).toBeGreaterThan(0)
    expect(delta).toBeLessThanOrEqual(607)
    expect(plan.publishAt.getUTCSeconds() === 0 && plan.publishAt.getUTCMinutes() % 5 === 0).toBe(false)
  })
})
