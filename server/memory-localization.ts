function localizedValues(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return {} as Record<string, string>
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function localizedMemoryForInterface(memory: Record<string, any>, interfaceLocale: string): Record<string, any> {
  if (memory.interfaceLocale === interfaceLocale) return memory
  const localized = localizedValues(memory.localizedValuesJson)[interfaceLocale]
  return localized
    ? { ...memory, value: localized, interfaceLocale, localizationFallback: false }
    : { ...memory, localizationFallback: true }
}
