/**
 * Kirchhoff analysis for a single series loop: one battery, one LED, one resistor.
 * KVL: V_battery = V_LED + V_R. KCL (series): same current through all branches.
 * See Kuphaldt DC Ch.6 — divider circuits & Kirchhoff’s laws.
 */

import type { CircuitComponent, Wire } from './circuitTypes'
import { buildUnionFind, netOf } from './graphUtils'
import { isSet, nearestE12Pair, roundE } from './electricUtils'

export type { CircuitComponent, Wire } from './circuitTypes'

export type KirchhoffSeriesResult =
  | { applicable: false }
  | { applicable: true; ok: false; message: string }
  | { applicable: true; ok: true; next: CircuitComponent[]; explanation: string }

/**
 * If the layout is exactly one battery + one LED + one resistor wired as one series loop,
 * solve missing values using KVL + KCL + Ohm’s law and return a step-by-step explanation.
 * Otherwise returns `{ applicable: false }` so the caller can fall back to per-part Ohm’s law.
 */
export function tryKirchhoffSeriesBatteryLedResistor(
  components: CircuitComponent[],
  wires: Wire[],
): KirchhoffSeriesResult {
  const others = components.filter((c) => c.kind !== 'battery' && c.kind !== 'led' && c.kind !== 'resistor')
  if (others.length > 0) {
    return { applicable: false }
  }

  const batteries = components.filter((c) => c.kind === 'battery')
  const leds = components.filter((c) => c.kind === 'led')
  const resistors = components.filter((c) => c.kind === 'resistor')

  if (batteries.length !== 1 || leds.length !== 1 || resistors.length !== 1) {
    return { applicable: false }
  }

  const battery = batteries[0]
  const led = leds[0]
  const resistor = resistors[0]

  const { uf, netCount } = buildUnionFind(components, wires)

  if (netCount !== 3) {
    return {
      applicable: true,
      ok: false,
      message:
        'Kirchhoff (series): need exactly one closed path with battery, LED, and resistor — three separate nodes (nets). Check that all three parts are wired in one series loop.',
    }
  }

  if (netOf(uf, battery.id, 'left') === netOf(uf, battery.id, 'right')) {
    return { applicable: true, ok: false, message: 'Battery terminals appear shorted together.' }
  }
  if (netOf(uf, led.id, 'left') === netOf(uf, led.id, 'right')) {
    return { applicable: true, ok: false, message: 'LED terminals appear shorted together.' }
  }
  if (netOf(uf, resistor.id, 'left') === netOf(uf, resistor.id, 'right')) {
    return { applicable: true, ok: false, message: 'Resistor terminals appear shorted together.' }
  }

  let Vbat = battery.voltage
  let Vled = led.voltage
  let I =
    isSet(led.current) ? led.current : isSet(resistor.current) ? resistor.current : battery.current
  let R = resistor.resistance

  const conflict = (a: number, b: number, label: string) => {
    if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) {
      return `${label} mismatch: ${a} vs ${b}.`
    }
    return null
  }

  if (isSet(led.current) && isSet(resistor.current)) {
    const err = conflict(led.current, resistor.current, 'Series current')
    if (err) {
      return { applicable: true, ok: false, message: err }
    }
  }
  if (isSet(battery.current) && isSet(led.current)) {
    const err = conflict(battery.current, led.current, 'Series current')
    if (err) {
      return { applicable: true, ok: false, message: err }
    }
  }

  if (!isSet(I) && isSet(battery.current)) {
    I = battery.current
  }

  let Vr: number | null = null

  const need = 'Provide enough values: e.g. battery voltage, LED forward voltage, and current (or resistance) so the rest can be found from KVL and Ohm’s law.'

  if (isSet(Vbat) && isSet(Vled) && isSet(I) && !isSet(R)) {
    Vr = roundE(Vbat - Vled)
    if (Vr <= 0) {
      return {
        applicable: true,
        ok: false,
        message: `KVL gives V_R = V_battery − V_LED = ${Vbat} − ${Vled} ≤ 0. Check voltages (LED forward voltage must be less than the battery).`,
      }
    }
    if (Math.abs(I) < 1e-15) {
      return { applicable: true, ok: false, message: 'Current is zero — cannot compute resistance.' }
    }
    R = roundE(Vr / I)
  } else if (isSet(Vbat) && isSet(Vled) && isSet(R) && !isSet(I)) {
    Vr = roundE(Vbat - Vled)
    if (Vr <= 0) {
      return {
        applicable: true,
        ok: false,
        message: `KVL: V_R = V_battery − V_LED = ${Vbat} − ${Vled} ≤ 0. Check values.`,
      }
    }
    if (Math.abs(R) < 1e-15) {
      return { applicable: true, ok: false, message: 'Resistance is zero — cannot compute current.' }
    }
    I = roundE(Vr / R)
  } else if (isSet(Vbat) && isSet(I) && isSet(R) && !isSet(Vled)) {
    Vr = roundE(I * R)
    Vled = roundE(Vbat - Vr)
    if (Vled <= 0) {
      return {
        applicable: true,
        ok: false,
        message: `Computed LED voltage would be ${Vled} V (not valid as a forward drop). Check I and R.`,
      }
    }
  } else if (isSet(Vled) && isSet(I) && isSet(R) && !isSet(Vbat)) {
    Vr = roundE(I * R)
    Vbat = roundE(Vled + Vr)
  } else if (isSet(Vbat) && isSet(Vled) && isSet(R) && isSet(I)) {
    Vr = roundE(Vbat - Vled)
    if (Vr <= 0) {
      return {
        applicable: true,
        ok: false,
        message: `KVL: V_R = V_battery − V_LED = ${Vbat} − ${Vled} ≤ 0. Check values.`,
      }
    }
    const Rcalc = Vr / I
    const err = conflict(R, Rcalc, 'Resistance')
    if (err) {
      return { applicable: true, ok: false, message: `${err} KVL + Ohm’s law expect R ≈ ${roundE(Rcalc)} Ω.` }
    }
  } else {
    return { applicable: true, ok: false, message: need }
  }

  if (!isSet(Vbat) || !isSet(Vled) || !isSet(I) || !isSet(R)) {
    return { applicable: true, ok: false, message: need }
  }

  Vr = roundE(Vbat - Vled)
  const Iseries = roundE(I)
  const Rfinal = roundE(R)
  const VbatOut = roundE(Vbat)
  const VledOut = roundE(Vled)

  const { lower, upper } = nearestE12Pair(Rfinal)

  const explanation = [
    'Kirchhoff’s voltage law (KVL)',
    'Around the loop, the source voltage equals the sum of the drops:',
    '',
    '  V_battery = V_LED + V_R',
    '',
    'So the voltage across the resistor is:',
    '',
    `  V_R = ${VbatOut} V − ${VledOut} V = ${Vr} V`,
    '',
    'Kirchhoff’s current law (KCL) in series: the same current flows everywhere, so',
    '',
    `  I = ${Iseries} A`,
    'through the resistor (and the LED).',
    '',
    'Ohm’s law for the resistor:',
    '',
    `  R = V_R / I = ${Vr} / ${Iseries} = ${Rfinal} Ω`,
    '',
    `Nearest common E12 values near ${Rfinal} Ω: ${lower} Ω and ${upper} Ω — pick the closest, then check that current stays near your target (e.g. 20 mA).`,
  ].join('\n')

  const next: CircuitComponent[] = components.map((c) => {
    if (c.id === battery.id) {
      return { ...c, voltage: VbatOut, current: Iseries }
    }
    if (c.id === led.id) {
      return { ...c, voltage: VledOut, current: Iseries, resistance: null }
    }
    if (c.id === resistor.id) {
      return { ...c, voltage: Vr, current: Iseries, resistance: Rfinal }
    }
    return c
  })

  return { applicable: true, ok: true, next, explanation }
}
