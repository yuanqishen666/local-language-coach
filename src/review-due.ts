export const REVIEW_DUE_REFRESH_EVENT = 'yujian:review-due-refresh'

/** Ask every visible shell to recalculate its due-review badge after the wordbook changes. */
export function requestReviewDueRefresh() {
  window.dispatchEvent(new Event(REVIEW_DUE_REFRESH_EVENT))
}
