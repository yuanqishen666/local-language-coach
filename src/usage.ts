import { ref } from 'vue'
import { api } from './api'

/** What a set of model requests came to. `cost` leaves out requests no price is known for. */
export interface Spend { cost: number; requests: number; inputTokens: number; outputTokens: number; unpriced: number; estimated: number }

export interface MonthUsage {
  currency: 'USD'
  pricesUpdated: string
  limit: number | null
  overLimit: boolean
  from: string
  to: string
  month: Spend
  previous: Spend
  tasks: Array<{ task: string; cost: number; requests: number }>
  models: Array<{ providerId: string; model: string; cost: number; requests: number; inputTokens: number; outputTokens: number; priced: boolean }>
}

const SMALLEST = 0.0001

/** A sum in US dollars. One model request costs a fraction of a cent, so sums under a dollar keep four decimals. */
export function formatCost(cost: number, locale: string) {
  const amount = Number.isFinite(cost) && cost > 0 ? cost : 0
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: amount < 1 ? 4 : 2 })
  return amount > 0 && amount < SMALLEST ? `< ${format.format(SMALLEST)}` : format.format(amount)
}

/** The learner's clock against UTC, the way the server's month and week boundaries take it. */
export function clockOffset() {
  return new Date().getTimezoneOffset()
}

export function loadMonthUsage() {
  return api.get<MonthUsage>(`/usage?offset=${clockOffset()}`)
}

/** Whether this month's spending has reached the amount the learner asked to be told at. */
export const overLimit = ref(false)

const CHECK_EVERY = 60_000
let checkedAt = 0

export async function checkLimit(force = false) {
  if (!force && Date.now() - checkedAt < CHECK_EVERY) return overLimit.value
  checkedAt = Date.now()
  try {
    overLimit.value = (await loadMonthUsage()).overLimit
  } catch {
    // The reminder waits for the next look.
  }
  return overLimit.value
}

const MAINLAND_CLOCKS = ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Kashgar', 'PRC']

/**
 * Whether this computer's clock is set to mainland China. Used only to say which model services
 * can usually be reached from there; nothing is switched on or off by it.
 */
export function mainlandChinaClock(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return MAINLAND_CLOCKS.includes(timeZone)
}
