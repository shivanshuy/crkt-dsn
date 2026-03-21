export const isSet = (n: number | null | undefined): n is number =>
  n !== null && n !== undefined && Number.isFinite(n)

export const roundE = (n: number) => Math.round(n * 1_000_000) / 1_000_000

/** E12 values in the 1–10 mantissa range */
const E12_MANT = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2] as const

export function nearestE12Pair(ohms: number): { lower: number; upper: number } {
  if (!Number.isFinite(ohms) || ohms <= 0) {
    return { lower: ohms, upper: ohms }
  }
  const log = Math.log10(ohms)
  const exp = Math.floor(log)
  const decade = 10 ** exp
  const mant = ohms / decade
  let lowerM: number = E12_MANT[0]
  let upperM: number = E12_MANT[E12_MANT.length - 1]
  for (let i = 0; i < E12_MANT.length; i += 1) {
    const m = E12_MANT[i]
    if (m <= mant) {
      lowerM = m
    }
    if (m >= mant) {
      upperM = m
      break
    }
  }
  return { lower: lowerM * decade, upper: upperM * decade }
}
