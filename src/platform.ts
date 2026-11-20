export type KeyboardPlatform = 'mac' | 'other'

interface NavigatorLike {
  userAgentData?: { platform?: string }
  platform?: string
  userAgent?: string
}

/** The keyboard the person is most likely typing on. It decides how keys are named on screen. */
export function keyboardPlatform(source?: NavigatorLike): KeyboardPlatform {
  const nav = source || (typeof navigator === 'undefined' ? undefined : navigator as NavigatorLike)
  const name = [nav?.userAgentData?.platform, nav?.platform, nav?.userAgent].find((value) => typeof value === 'string' && value) || ''
  return /mac|iphone|ipad|ipod/i.test(name) ? 'mac' : 'other'
}

/** The keys that send a message and that start a new line, as they are printed on that keyboard. */
export function composerKeys(platform: KeyboardPlatform) {
  const enter = platform === 'mac' ? 'Return' : 'Enter'
  return { send: [enter], newline: ['Shift', enter] }
}
