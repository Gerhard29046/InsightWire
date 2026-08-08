import type { SourceConnector } from './types'

/**
 * Registration and lookup only. Running connectors on a schedule, retrying
 * failures, and collecting metrics is the Connector Manager's job (Phase 2)
 * — kept out of this class on purpose so Phase 1 stays reviewable on its own.
 */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, SourceConnector>()

  register(connector: SourceConnector): void {
    if (this.connectors.has(connector.id)) {
      throw new Error(`Connector "${connector.id}" is already registered`)
    }
    this.connectors.set(connector.id, connector)
  }

  get(id: string): SourceConnector | undefined {
    return this.connectors.get(id)
  }

  list(): SourceConnector[] {
    return [...this.connectors.values()]
  }

  listEnabled(): SourceConnector[] {
    return this.list().filter((connector) => connector.enabled)
  }
}
