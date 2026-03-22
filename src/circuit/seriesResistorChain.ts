/**
 * Pure series loop: one battery + N resistors (no LED).
 * Voltage divider: E_Rn = E_total × (Rn / R_total) — Kuphaldt DC Ch.6.
 * KVL: sum of drops = source; KCL: same I everywhere in series.
 */

import type { CircuitComponent, Wire } from '../types/circuit'
import { buildUnionFind, netOf } from './graphUtils'
import { isSet, roundE } from './electricUtils'
import type { KirchhoffSeriesResult } from './kirchhoffSeries'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function agreeSeriesCurrent(a: number, b: number) {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a))
}

export function trySeriesResistorChain(
  components: CircuitComponent[],
  wires: Wire[],
): KirchhoffSeriesResult {
  const others = components.filter((c) => c.kind !== 'battery' && c.kind !== 'resistor')
  if (others.length > 0) {
    return { applicable: false }
  }

  const batteries = components.filter((c) => c.kind === 'battery')
  const resistors = components.filter((c) => c.kind === 'resistor')
  if (batteries.length !== 1 || resistors.length < 1) {
    return { applicable: false }
  }

  const k = resistors.length
  const { uf, netCount } = buildUnionFind(components, wires)
  if (netCount !== k + 1) {
    return { applicable: false }
  }

  const battery = batteries[0]
  for (const r of resistors) {
    if (netOf(uf, r.id, 'left') === netOf(uf, r.id, 'right')) {
      return {
        applicable: true,
        ok: false,
        message: 'A resistor appears shorted between its terminals.',
      }
    }
  }
  if (netOf(uf, battery.id, 'left') === netOf(uf, battery.id, 'right')) {
    return { applicable: true, ok: false, message: 'Battery terminals are shorted together.' }
  }

  let Vbat = battery.voltage

  let Iseries: number | null = null
  for (const r of resistors) {
    if (isSet(r.current)) {
      if (Iseries === null) {
        Iseries = r.current
      } else if (!agreeSeriesCurrent(Iseries, r.current)) {
        return {
          applicable: true,
          ok: false,
          message: 'Series circuit: all resistors must carry the same current.',
        }
      }
    }
  }
  if (isSet(battery.current)) {
    if (Iseries === null) {
      Iseries = battery.current
    } else if (!agreeSeriesCurrent(Iseries, battery.current)) {
      return {
        applicable: true,
        ok: false,
        message: 'Battery current does not match the series branch current.',
      }
    }
  }

  const need =
    'Series: provide battery voltage and all resistances, or battery voltage and series current, or battery voltage + current + all but one resistance.'

  const Rvals = resistors.map((r) => r.resistance)
  const knownCount = Rvals.filter(isSet).length

  /** Voltage divider drops when Vbat, R_total, and each R_i are known */
  const applyDivider = (vbat: number, rs: number[]) => {
    const R_total = sum(rs)
    if (R_total <= 0) {
      return { ok: false as const, message: 'Total resistance must be positive.' }
    }
    const I = roundE(vbat / R_total)
    const drops = rs.map((ri) => roundE(vbat * (ri / R_total)))
    return { ok: true as const, I, drops, R_total }
  }

  // All resistances known + Vbat
  if (knownCount === k && isSet(Vbat)) {
    const rs = Rvals.map((r) => r as number)
    const div = applyDivider(Vbat, rs)
    if (!div.ok) {
      return { applicable: true, ok: false, message: div.message }
    }
    const { I, drops, R_total } = div
    const VbatOut = roundE(Vbat)
    const lines = [
      'Series circuit — voltage divider (Kuphaldt DC Ch.6, “Voltage divider circuits”).',
      'KVL: the sum of resistor voltage drops equals the source voltage.',
      'KCL: the same current flows through every series element.',
      '',
      `  R_total = ${rs.map((r) => `${r}`).join(' + ')} = ${roundE(R_total)} Ω`,
      '',
      'Voltage divider formula: E_Rn = E_total × (Rn / R_total)',
      '',
      `  I = E_total / R_total = ${VbatOut} / ${roundE(R_total)} = ${I} A`,
      '',
      ...resistors.flatMap((_r, i) => [
        `  E_${i + 1} (${roundE(rs[i])} Ω branch) = ${VbatOut} × (${roundE(rs[i])} / ${roundE(R_total)}) = ${drops[i]} V`,
      ]),
      '',
      '(Reference: ibiblio.org — Lessons in Electric Circuits, DC volume, divider circuits & KVL.)',
    ]
    const next = buildNext(components, battery.id, VbatOut, I, resistors, drops, rs)
    return { applicable: true, ok: true, next, explanation: lines.join('\n') }
  }

  // All resistances known + I (no Vbat)
  if (knownCount === k && isSet(Iseries) && !isSet(Vbat)) {
    const rs = Rvals.map((r) => r as number)
    const R_total = sum(rs)
    if (R_total <= 0) {
      return { applicable: true, ok: false, message: 'Total resistance must be positive.' }
    }
    Vbat = roundE(Iseries * R_total)
    const div = applyDivider(Vbat, rs)
    if (!div.ok) {
      return { applicable: true, ok: false, message: div.message }
    }
    const { I, drops, R_total: Rt } = div
    const lines = [
      'Series circuit — Ohm’s law and voltage divider.',
      `Given series current I = ${I} A and resistances,`,
      '',
      `  E_total = I × R_total = ${I} × ${roundE(Rt)} = ${Vbat} V`,
      '',
      'Per-branch drops E_Rn = E_total × (Rn / R_total):',
      '',
      ...resistors.map(
        (_r, i) =>
          `  E_${i + 1} = ${Vbat} × (${roundE(rs[i])} / ${roundE(Rt)}) = ${drops[i]} V`,
      ),
    ]
    const next = buildNext(components, battery.id, Vbat, I, resistors, drops, rs)
    return { applicable: true, ok: true, next, explanation: lines.join('\n') }
  }

  // Vbat + I + (k−1) resistances → find missing R
  if (isSet(Vbat) && isSet(Iseries) && knownCount === k - 1) {
    if (Math.abs(Iseries) < 1e-15) {
      return { applicable: true, ok: false, message: 'Current is zero — cannot determine resistance.' }
    }
    const R_total = roundE(Vbat / Iseries)
    const knownRs = resistors
      .map((r) => r.resistance)
      .filter(isSet) as number[]
    const sumKnown = sum(knownRs)
    const Rmiss = roundE(R_total - sumKnown)
    if (Rmiss <= 0) {
      return {
        applicable: true,
        ok: false,
        message: `Computed missing resistance would be ≤ 0 (R_total = ${R_total} Ω). Check values.`,
      }
    }
    const idxMissing = resistors.findIndex((r) => !isSet(r.resistance))
    if (idxMissing < 0) {
      return { applicable: true, ok: false, message: need }
    }
    const rs = resistors.map((r, i) => (i === idxMissing ? Rmiss : (r.resistance as number)))
    const div = applyDivider(Vbat, rs)
    if (!div.ok) {
      return { applicable: true, ok: false, message: div.message }
    }
    const { I, drops } = div
    const lines = [
      'Series circuit — KVL and Ohm’s law.',
      `  R_total = E_total / I = ${roundE(Vbat)} / ${Iseries} = ${R_total} Ω`,
      `  R_missing = R_total − (sum of other resistors) = ${Rmiss} Ω`,
      '',
      'Voltage divider drops:',
      ...resistors.map(
        (_r, i) =>
          `  E_${i + 1} = ${roundE(Vbat)} × (${roundE(rs[i])} / ${R_total}) = ${drops[i]} V`,
      ),
    ]
    const next = buildNext(components, battery.id, roundE(Vbat), I, resistors, drops, rs)
    return { applicable: true, ok: true, next, explanation: lines.join('\n') }
  }

  return { applicable: true, ok: false, message: need }
}

function buildNext(
  components: CircuitComponent[],
  batteryId: string,
  Vbat: number,
  I: number,
  resistors: CircuitComponent[],
  drops: number[],
  rs: number[],
): CircuitComponent[] {
  const mapR = new Map(resistors.map((r, i) => [r.id, { v: drops[i], r: rs[i] }]))
  return components.map((c) => {
    if (c.id === batteryId) {
      return { ...c, voltage: Vbat, current: I }
    }
    if (c.kind === 'resistor') {
      const row = mapR.get(c.id)
      if (row) {
        return { ...c, voltage: row.v, current: I, resistance: row.r }
      }
    }
    return c
  })
}
