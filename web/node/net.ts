/** The part of node:net the app uses. */
export function isIP(text: string) {
  if (/^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/u.test(text)) return 4
  if (!/^[0-9a-f:.]+$/iu.test(text) || !text.includes(':')) return 0
  try { return new URL(`http://[${text}]/`) ? 6 : 0 } catch { return 0 }
}
