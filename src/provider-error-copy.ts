import { ApiError } from "./api";
import { copyText, type CopyKey } from "./i18n/copy";
import { normalizeUiLocale } from "../shared/locales";

export function translationErrorMessage(error: unknown, locale: string) {
  const code = error instanceof ApiError ? error.code : undefined;
  const messages: Record<string, CopyKey> = {
    PROVIDER_TRUNCATED_RESPONSE: "error.translationTruncated",
    PROVIDER_CONTEXT_LIMIT: "error.translationContext",
    PROVIDER_TIMEOUT: "error.translationTimeout",
    PROVIDER_RATE_LIMITED: "error.translationBusy",
    PROVIDER_UNAVAILABLE: "error.translationUnavailable",
    PROVIDER_NETWORK_ERROR: "error.translationNetwork",
    PROVIDER_EMPTY_RESPONSE: "error.translationEmpty",
    PROVIDER_INVALID_RESPONSE: "error.translationInvalid",
    PROVIDER_REFUSAL: "error.translationRefusal",
    PROVIDER_INVALID_REQUEST: "error.translationInvalidRequest",
  };

  return copyText(code && messages[code] ? messages[code] : "error.translationFallback", normalizeUiLocale(locale));
}

/** Why a model call behind a page action failed, in the short wording the conversation uses. Null when the page should say it its own way. */
export function modelErrorKey(error: unknown): CopyKey | null {
  const code = error instanceof ApiError ? error.code : undefined;
  const messages: Record<string, CopyKey> = {
    PROVIDER_RATE_LIMITED: "error.turnBusy",
    PROVIDER_TIMEOUT: "error.turnTimeout",
    PROVIDER_NETWORK_ERROR: "error.turnNetwork",
    PROVIDER_UNAVAILABLE: "error.turnUnavailable",
    PROVIDER_EMPTY_RESPONSE: "error.turnIncomplete",
    PROVIDER_INVALID_RESPONSE: "error.turnIncomplete",
    PROVIDER_TRUNCATED_RESPONSE: "error.turnTruncated",
    PROVIDER_CONTEXT_LIMIT: "error.turnContextOpen",
    PROVIDER_AUTH_FAILED: "error.turnAuth",
    PROVIDER_BALANCE_REQUIRED: "error.turnBalance",
    PROVIDER_NOT_FOUND: "error.turnModel",
    PROVIDER_INVALID_REQUEST: "error.turnInvalidRequest",
    PROVIDER_ERROR: "error.turnProvider",
    MODEL_CONFIGURATION_REQUIRED: "error.turnModel",
  };
  return code && messages[code] ? messages[code] : null;
}
