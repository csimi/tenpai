// Clamp a player-supplied display name to something that can't break the UI.
// Keeps Unicode letters and numbers (so Japanese names work) plus single
// spaces, and drops everything else — control/format/combining "zalgo" marks,
// emoji, markup characters. Collapses runs of spaces, trims, and caps length.
export const NAME_MAX = 16

export function sanitizeName(raw) {
  return [...String(raw ?? '')]
    .filter((ch) => /[\p{L}\p{N} ]/u.test(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, NAME_MAX)
}
