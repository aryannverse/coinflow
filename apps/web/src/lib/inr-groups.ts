/**
 * Digit place values of a whole-rupee amount, split the way en-IN groups them:
 * the last three digits, then pairs going left (12,50,000 -> [[1e6,1e5],[1e4,1e3],[100,10,1]]).
 */
export function inrPlaceGroups(rupees: number): number[][] {
  const digits = String(Math.max(0, Math.trunc(rupees))).length
  const places = Array.from({ length: digits }, (_, i) => 10 ** (digits - 1 - i))
  const groups: number[][] = []
  let end = places.length
  let size = 3
  while (end > 0) {
    groups.unshift(places.slice(Math.max(0, end - size), end))
    end -= size
    size = 2
  }
  return groups
}
