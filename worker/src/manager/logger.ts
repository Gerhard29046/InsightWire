import type { LogEntry, Logger } from './types'

/**
 * JSON-per-line to console, routed by level. This is directly
 * Workers-appropriate — Cloudflare Workers Logs/Logpush capture console
 * output as structured logs — not a placeholder to swap out later.
 */
export const consoleLogger: Logger = {
  log(entry: LogEntry): void {
    const line = JSON.stringify(entry)
    if (entry.level === 'error') console.error(line)
    else if (entry.level === 'warn') console.warn(line)
    else console.log(line)
  },
}
