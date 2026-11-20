import { MAX_STEP } from '../shared/proficiency'

export interface ProgressDay { date: string; messages: number; amount: number }
export interface GridCell extends ProgressDay {
  /** How much was written that day against the busiest day shown: 0 for nothing, 4 for the most. */
  level: 0 | 1 | 2 | 3 | 4
  /** Later in this week than today. */
  future: boolean
}

const DAY = 86_400_000
const dayAt = (date: string) => Date.parse(`${date}T00:00:00Z`)
const dateOf = (at: number) => new Date(at).toISOString().slice(0, 10)

/** Whole weeks ending with the one `today` is in, Monday first, with every day of them filled in. */
export function activityGrid(days: ProgressDay[], today: string, weeks: number): GridCell[][] {
  const end = dayAt(today)
  const monday = end - ((new Date(end).getUTCDay() + 6) % 7) * DAY
  const start = monday - (weeks - 1) * 7 * DAY
  const first = dateOf(start)
  const known = new Map(days.map((day) => [day.date, day]))
  const peak = Math.max(1, ...days.filter((day) => day.date >= first && day.date <= today).map((day) => day.amount))
  return Array.from({ length: weeks }, (_week, week) => Array.from({ length: 7 }, (_day, weekday) => {
    const date = dateOf(start + (week * 7 + weekday) * DAY)
    const day = known.get(date)
    const amount = day?.amount || 0
    return {
      date,
      messages: day?.messages || 0,
      amount,
      level: (amount > 0 ? Math.min(4, Math.ceil((amount / peak) * 4)) : 0) as GridCell['level'],
      future: date > today,
    }
  }))
}

/** The week columns a month name stands over: the first shown, and each one a new month starts in. */
export function monthStarts(grid: GridCell[][]) {
  const starts: Array<{ week: number; date: string }> = []
  grid.forEach((week, index) => {
    const month = week[0].date.slice(0, 7)
    if (index === 0 || month !== grid[index - 1][0].date.slice(0, 7)) starts.push({ week: index, date: week[0].date })
  })
  // A name over the very first column would run into the next one when that month ends within two weeks.
  return starts.length > 1 && starts[1].week - starts[0].week < 3 ? starts.slice(1) : starts
}

/**
 * The level over time, oldest first, as points of a line 100 wide and 28 high. Drawn over the range
 * the level has actually covered: on the whole scale a few steps would look flat.
 */
export function levelCurve(steps: number[]) {
  if (steps.length < 2) return ''
  const low = Math.max(0, Math.min(...steps) - 1)
  const high = Math.min(MAX_STEP, Math.max(...steps) + 1)
  return steps.map((step, index) => `${((index / (steps.length - 1)) * 100).toFixed(1)},${(26 - ((step - low) / Math.max(1, high - low)) * 24).toFixed(1)}`).join(' ')
}
