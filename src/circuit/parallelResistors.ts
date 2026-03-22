/**
 * Parallel resistor bank across one battery: two nets, each resistor spans the same pair.
 * Same voltage across branches; KCL: I_total = sum of branch currents (current divider).
 * Kuphaldt DC Ch.6 — parallel / current divider.
 */

import type { CircuitComponent, Wire } from '../types/circuit'
import { buildUnionFind, netOf, resistorSpansNets } from './graphUtils'
import { isSet, roundE } from './electricUtils'
import type { KirchhoffSeriesResult } from './kirchhoffSeries'

const invSum = (reciprocals: number[]) => reciprocals.reduce((a, b) => a + b, 0)

export function tryParallelResistorsBank(
  components: CircuitComponent[],
  wires: Wire[],
): KirchhoffSeriesResult {
  const others = components.filter((c) => c.kind !== 'battery' && c.kind !== 'resistor')
  if (others.length > 0) {
    return { applicable: false }
  }

  const batteries = components.filter((c) => c.kind === 'battery')
  const resistors = components.filter((c) => c.kind === 'resistor')
  if (batteries.length !== 1 || resistors.length < 2) {
    return { applicable: false }
  }

  const { uf, netCount } = buildUnionFind(components, wires)
  if (netCount !== 2) {
    return { applicable: false }
  }

  const battery = batteries[0]
  const n1 = netOf(uf, battery.id, 'left')
  const n2 = netOf(uf, battery.id, 'right')

  for (const r of resistors) {
    if (netOf(uf, r.id, 'left') === netOf(uf, r.id, 'right')) {
      return { applicable: true, ok: false, message: 'A resistor appears shorted between its terminals.' }
    }
    if (!resistorSpansNets(uf, r.id, n1, n2)) {
      return { applicable: false }
    }
  }

  const k = resistors.length
  let Vbat = battery.voltage

  const need =
    'Parallel: provide battery voltage and all branch resistances, or all resistances and total current from the battery.'

  const Rvals = resistors.map((r) => r.resistance)
  const knownR = Rvals.filter(isSet).length

  // All R known + Vbat
  if (knownR === k && isSet(Vbat)) {
    const rs = Rvals.map((r) => r as number)
    const invR = rs.map((r) => {
      if (Math.abs(r) < 1e-15) {
        return Number.POSITIVE_INFINITY
      }
      return 1 / r
    })
    if (!invR.every(Number.isFinite)) {
      return { applicable: true, ok: false, message: 'A branch resistance is zero — invalid for this model.' }
    }
    const G_eq = invSum(invR)
    const R_eq = roundE(1 / G_eq)
    const I_total = roundE(Vbat / R_eq)
    const VbatNum = Vbat as number
    const branchI = rs.map((r) => roundE(VbatNum / r))
    const Vout = roundE(VbatNum)

    const lines = [
      'Parallel resistors — same voltage across each branch (Kuphaldt DC Ch.6).',
      'KCL: total current leaving the source equals the sum of branch currents.',
      '',
      `  1/R_eq = ${rs.map((r) => `1/${r}`).join(' + ')}  →  R_eq = ${R_eq} Ω`,
      '',
      `  I_total = E / R_eq = ${Vout} / ${R_eq} = ${I_total} A`,
      '',
      'Per branch (Ohm’s law): I_n = E / Rn',
      '',
      ...resistors.map((_r, i) => `  I_${i + 1} = ${Vout} / ${rs[i]} = ${branchI[i]} A`),
      '',
      'Current divider (when total current is known): I_n = I_total × (R_eq / Rn).',
      '',
      '(Reference: ibiblio.org — Lessons in Electric Circuits, DC volume, parallel circuits & KCL.)',
    ]

    const next = components.map((c) => {
      if (c.id === battery.id) {
        return { ...c, voltage: Vout, current: I_total }
      }
      if (c.kind === 'resistor') {
        const idx = resistors.findIndex((r) => r.id === c.id)
        if (idx >= 0) {
          return { ...c, voltage: Vout, current: branchI[idx], resistance: rs[idx] }
        }
      }
      return c
    })

    return { applicable: true, ok: true, next, explanation: lines.join('\n') }
  }

  // All R known + battery current (total) → infer Vbat
  if (knownR === k && isSet(battery.current) && !isSet(Vbat)) {
    const rs = Rvals.map((r) => r as number)
    const invR = rs.map((r) => 1 / r)
    const G_eq = invSum(invR)
    const R_eq = roundE(1 / G_eq)
    const I_total = battery.current
    Vbat = roundE(I_total * R_eq)
    const VbatNum = Vbat as number
    const branchI = rs.map((r) => roundE(VbatNum / r))

    const lines = [
      'Parallel bank: equivalent resistance and source voltage from total current.',
      `  R_eq = ${R_eq} Ω`,
      `  E = I_total × R_eq = ${I_total} × ${R_eq} = ${Vbat} V`,
      '',
      'Branch currents I_n = E / Rn:',
      ...resistors.map((_r, i) => `  I_${i + 1} = ${branchI[i]} A`),
    ]

    const next = components.map((c) => {
      if (c.id === battery.id) {
        return { ...c, voltage: Vbat, current: I_total }
      }
      if (c.kind === 'resistor') {
        const idx = resistors.findIndex((r) => r.id === c.id)
        if (idx >= 0) {
          return { ...c, voltage: Vbat, current: branchI[idx], resistance: rs[idx] }
        }
      }
      return c
    })

    return { applicable: true, ok: true, next, explanation: lines.join('\n') }
  }

  return { applicable: true, ok: false, message: need }
}
