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
