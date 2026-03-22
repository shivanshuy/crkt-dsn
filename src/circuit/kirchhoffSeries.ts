/**
 * Kirchhoff analysis for a single series loop: one battery, one LED, one resistor.
 * KVL: V_battery = V_LED + V_R. KCL (series): same current through all branches.
 * See Kuphaldt DC Ch.6 — divider circuits & Kirchhoff’s laws.
 */

import type { CircuitComponent, Wire } from '../types/circuit'
import {
  getForcedSeriesCurrentFromLockedParts,
  isComponentPropertiesLocked,
} from '../utils/componentLock'
import { buildUnionFind, netOf } from './graphUtils'
import { isSet, nearestE12Pair, roundE } from './electricUtils'

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

  const resistorUnlocked = !isComponentPropertiesLocked(resistor)
  const batteryUnlocked = !isComponentPropertiesLocked(battery)

  const { uf, netCount } = buildUnionFind(components, wires)

  if (netCount !== 3) {
    // Not a simple 3-node series graph — do not claim this solver; let runCircuitCalculate fall
    // through to per-part Ohm’s law (and other topologies) instead of blocking with a hard error.
    return { applicable: false }
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

  const forcedBranchCurrent = getForcedSeriesCurrentFromLockedParts([battery, led, resistor])
  if (!forcedBranchCurrent.ok) {
    return { applicable: true, ok: false, message: forcedBranchCurrent.message }
  }
  const seriesCurrentFromLock = forcedBranchCurrent.I !== null

  const conflict = (a: number, b: number, label: string) => {
    if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) {
      return `${label} mismatch: ${a} vs ${b}.`
    }
    return null
  }

  if (!seriesCurrentFromLock) {
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
    if (isSet(battery.current) && isSet(resistor.current)) {
      const err = conflict(battery.current, resistor.current, 'Series current')
      if (err) {
        return { applicable: true, ok: false, message: err }
      }
    }
  }

  if (!isSet(I) && isSet(battery.current)) {
    I = battery.current
  }

  let Vr: number | null = null
  let kvlMismatchNote: string | null = null

  const need = 'Provide enough values: e.g. battery voltage, LED forward voltage, and current (or resistance) so the rest can be found from KVL and Ohm’s law.'

  let solvedFromLockedBranchCurrent = false
  let unlockedResistorSolvedByKvl = false
  let unlockedBatterySolvedByKvl = false

  if (seriesCurrentFromLock && forcedBranchCurrent.I !== null) {
    const Ilocked = forcedBranchCurrent.I
    I = Ilocked

    // Unlocked resistor: KVL first — V_R = V_battery − V_LED, then R = V_R / I (ignore stale R on canvas).
    if (resistorUnlocked && isSet(Vbat) && isSet(Vled)) {
      Vr = roundE((Vbat as number) - (Vled as number))
      if (Vr <= 0) {
        return {
          applicable: true,
          ok: false,
          message: `KVL: V_R = V_battery − V_LED = ${Vbat} − ${Vled} ≤ 0. Check voltages.`,
        }
      }
      if (Math.abs(Ilocked) < 1e-15) {
        return { applicable: true, ok: false, message: 'Current is zero — cannot compute resistance.' }
      }
      R = roundE(Vr / Ilocked)
      kvlMismatchNote = null
      unlockedResistorSolvedByKvl = true
      solvedFromLockedBranchCurrent = true
    } else if (batteryUnlocked && isSet(Vled) && isSet(R)) {
      if (Math.abs(R as number) < 1e-15) {
        return { applicable: true, ok: false, message: 'Resistance is zero — invalid.' }
      }
      Vr = roundE(Ilocked * (R as number))
      Vbat = roundE((Vled as number) + Vr)
      kvlMismatchNote = null
      unlockedBatterySolvedByKvl = true
      solvedFromLockedBranchCurrent = true
    } else if (isSet(Vbat) && isSet(Vled) && isSet(R) && !resistorUnlocked) {
      if (Math.abs(R as number) < 1e-15) {
        return { applicable: true, ok: false, message: 'Resistance is zero — cannot compute resistor drop.' }
      }
      Vr = roundE(Ilocked * (R as number))
      const vKvl = roundE((Vbat as number) - (Vled as number))
      if (Math.abs(Vr - vKvl) > 1e-5 * Math.max(1, Math.abs(Vr), Math.abs(vKvl))) {
        kvlMismatchNote = [
          '',
          'KVL check: V_battery − V_LED = ' + `${vKvl} V, but with locked branch current I = ${Ilocked} A we have V_R = I×R = ${Vr} V.`,
          'The resistor is locked so its Ω value is kept; unlock it (and lock the others) to recompute R from KVL, or relax locked specs.',
        ].join('\n')
      }
      solvedFromLockedBranchCurrent = true
    } else if (isSet(Vbat) && isSet(Vled) && !isSet(R) && !resistorUnlocked) {
      Vr = roundE((Vbat as number) - (Vled as number))
      if (Vr <= 0) {
        return {
          applicable: true,
          ok: false,
          message: `KVL gives V_R = V_battery − V_LED = ${Vbat} − ${Vled} ≤ 0. Check voltages.`,
        }
      }
      if (Math.abs(Ilocked) < 1e-15) {
        return { applicable: true, ok: false, message: 'Current is zero — cannot compute resistance.' }
      }
      R = roundE(Vr / Ilocked)
      solvedFromLockedBranchCurrent = true
    } else if (isSet(Vbat) && isSet(R) && !isSet(Vled)) {
      if (Math.abs(R as number) < 1e-15) {
        return { applicable: true, ok: false, message: 'Resistance is zero — invalid.' }
      }
      Vr = roundE(Ilocked * (R as number))
      Vled = roundE((Vbat as number) - Vr)
      if (Vled <= 0) {
        return {
          applicable: true,
          ok: false,
          message: `Computed LED voltage would be ${Vled} V. Check battery, current, and resistance.`,
        }
      }
      solvedFromLockedBranchCurrent = true
    } else if (isSet(Vled) && isSet(R) && !isSet(Vbat)) {
      if (Math.abs(R as number) < 1e-15) {
        return { applicable: true, ok: false, message: 'Resistance is zero — invalid.' }
      }
      Vr = roundE(Ilocked * (R as number))
      Vbat = roundE((Vled as number) + Vr)
      solvedFromLockedBranchCurrent = true
    }
  }

  if (seriesCurrentFromLock && !solvedFromLockedBranchCurrent) {
    return {
      applicable: true,
      ok: false,
      message:
        'A locked part fixes branch current: provide battery voltage, LED forward voltage, and resistance (or another complete set, e.g. Vbat+R with Vf unknown) so this loop can be solved at that current.',
    }
  }

  // Prefer Vbat + V_led + R → I when R is known (so a new R or supply after Calculate updates current).
  // Skipped when a locked part pins branch current — series I stays that value.
  // Otherwise Vbat + V_led + I → R when I is known but R is not.
  if (!solvedFromLockedBranchCurrent && isSet(Vbat) && isSet(Vled) && isSet(R)) {
    Vr = roundE(Vbat - Vled)
    if (Vr <= 0) {
      return {
        applicable: true,
        ok: false,
        message: `KVL: V_R = V_battery − V_LED = ${Vbat} − ${Vled} ≤ 0. Check values.`,
      }
    }
    if (Math.abs(R as number) < 1e-15) {
      return { applicable: true, ok: false, message: 'Resistance is zero — cannot compute current.' }
    }
    I = roundE(Vr / (R as number))
  } else if (!solvedFromLockedBranchCurrent && isSet(Vbat) && isSet(Vled) && isSet(I)) {
    Vr = roundE(Vbat - Vled)
    if (Vr <= 0) {
      return {
        applicable: true,
        ok: false,
        message: `KVL gives V_R = V_battery − V_LED = ${Vbat} − ${Vled} ≤ 0. Check voltages (LED forward voltage must be less than the battery).`,
      }
    }
    if (Math.abs(I as number) < 1e-15) {
      return { applicable: true, ok: false, message: 'Current is zero — cannot compute resistance.' }
    }
    R = roundE(Vr / (I as number))
  } else if (!solvedFromLockedBranchCurrent && isSet(Vbat) && isSet(I) && isSet(R)) {
    Vr = roundE((I as number) * (R as number))
    Vled = roundE((Vbat as number) - Vr)
    if (Vled <= 0) {
      return {
        applicable: true,
        ok: false,
        message: `Computed LED voltage would be ${Vled} V (not valid as a forward drop). Check I and R.`,
      }
    }
  } else if (!solvedFromLockedBranchCurrent && isSet(Vled) && isSet(I) && isSet(R)) {
    Vr = roundE((I as number) * (R as number))
    Vbat = roundE((Vled as number) + Vr)
  } else if (!solvedFromLockedBranchCurrent) {
    return { applicable: true, ok: false, message: need }
  }

  if (!isSet(Vbat) || !isSet(Vled) || !isSet(I) || !isSet(R)) {
    return { applicable: true, ok: false, message: need }
  }

  if (Vr === null) {
    Vr = roundE((Vbat as number) - (Vled as number))
  } else {
    Vr = roundE(Vr)
  }
  const Iseries = roundE(I)
  const Rfinal = roundE(R)
  const VbatOut = roundE(Vbat)
  const VledOut = roundE(Vled)

  const { lower, upper } = nearestE12Pair(Rfinal)

  const useLockedResistorIxRNarrative =
    solvedFromLockedBranchCurrent &&
    !unlockedResistorSolvedByKvl &&
    !unlockedBatterySolvedByKvl

  let kvlIntro: string[]
  if (unlockedResistorSolvedByKvl) {
    kvlIntro = [
      'Branch current comes from locked part(s) (KCL). The resistor is the only unlocked part, so KVL fixes its drop and R is recomputed (the old Ω value is not kept):',
      '',
      `  V_R = V_battery − V_LED = ${VbatOut} V − ${VledOut} V = ${Vr} V`,
      '',
      `  R = V_R / I = ${Vr} / ${Iseries} = ${Rfinal} Ω`,
    ]
  } else if (unlockedBatterySolvedByKvl) {
    kvlIntro = [
      'Branch current comes from locked part(s) (KCL). The battery is the only unlocked part, so V_R = I×R from the locked resistor, then KVL gives the source voltage:',
      '',
      `  V_R = I × R = ${Iseries} A × ${Rfinal} Ω = ${Vr} V`,
      '',
      `  V_battery = V_LED + V_R = ${VledOut} V + ${Vr} V = ${VbatOut} V`,
    ]
  } else if (useLockedResistorIxRNarrative) {
    kvlIntro = [
      'One or more locked parts pin branch current, so KCL uses that current everywhere in this loop.',
      'The resistor is locked, so its resistance stays fixed; drop uses I×R:',
      '',
      `  V_R = I × R = ${Iseries} A × ${Rfinal} Ω = ${Vr} V`,
      '',
      'KVL cross-check with listed battery and LED forward voltage:',
      '',
      '  V_battery = V_LED + V_R  →  V_R from KVL would be ' +
        `${VbatOut} V − ${VledOut} V = ${roundE(VbatOut - VledOut)} V`,
    ]
  } else {
    kvlIntro = [
      'Kirchhoff’s voltage law (KVL)',
      'Around the loop, the source voltage equals the sum of the drops:',
      '',
      '  V_battery = V_LED + V_R',
      '',
      'So the voltage across the resistor is:',
      '',
      `  V_R = ${VbatOut} V − ${VledOut} V = ${Vr} V`,
    ]
  }

  const resistorOhmLines =
    unlockedResistorSolvedByKvl || unlockedBatterySolvedByKvl
      ? []
      : useLockedResistorIxRNarrative
        ? [
            `Locked resistor value: ${Rfinal} Ω (unlock the resistor and lock the others to recompute R from KVL).`,
          ]
        : [
            'Ohm’s law for the resistor:',
            '',
            `  R = V_R / I = ${Vr} / ${Iseries} = ${Rfinal} Ω`,
          ]

  const explanation = [
    ...kvlIntro,
    '',
    'Kirchhoff’s current law (KCL) in series: the same current flows everywhere, so',
    '',
    `  I = ${Iseries} A`,
    'through the resistor (and the LED).',
    '',
    ...resistorOhmLines,
    '',
    `Nearest common E12 values near ${Rfinal} Ω: ${lower} Ω and ${upper} Ω — pick the closest, then check that current stays near your target (e.g. 20 mA).`,
    ...(kvlMismatchNote ? [kvlMismatchNote] : []),
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
