/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the Intelligence API (the Cloudflare Worker — see
   * worker/src/api/router.ts and docs/decisions/0009-intelligence-api.md).
   * Unset -> the events feed treats that as a distinct "not configured"
   * state (ApiNotConfiguredError) rather than a network error.
   */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
