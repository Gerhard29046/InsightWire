import { ConnectorRegistry } from './connectors/registry'
import { NasaConnector } from './connectors/sources/nasa'
import { WhoConnector } from './connectors/sources/who'
import { UnConnector } from './connectors/sources/un'
import { GdacsConnector } from './connectors/sources/gdacs'
import { NwsConnector } from './connectors/sources/nws'
import { SouthAfricaGovConnector } from './connectors/sources/southAfricaGov'
import { NamibiaNewEraConnector } from './connectors/sources/namibiaNewEra'
import { ZimbabweZbcConnector } from './connectors/sources/zimbabweZbc'
import { SAnewsConnector, SAnewsFeaturesConnector } from './connectors/sources/sanews'
import { SouthAfricaGovEventsConnector } from './connectors/sources/southAfricaGovEvents'
import { SouthAfricaPresidencyEventsConnector } from './connectors/sources/southAfricaPresidencyEvents'
import { UsFederalReserveConnector } from './connectors/sources/usFederalReserve'
import { UsWhiteHouseConnector } from './connectors/sources/usWhiteHouse'
import { UkGovernmentConnector } from './connectors/sources/ukGovernment'
import { BankOfEnglandConnector } from './connectors/sources/bankOfEngland'
import { EuCommissionConnector } from './connectors/sources/euCommission'
import { EcbConnector } from './connectors/sources/ecb'
import { ConnectorManager } from './manager/ConnectorManager'
import type { ConnectorManagerOptions } from './manager/ConnectorManager'

export { ConnectorRegistry } from './connectors/registry'
export type {
  ConnectorHealthStatus,
  ConnectorRateLimit,
  ConnectorType,
  RawEvent,
  SourceConnector,
  ValidationResult,
} from './connectors/types'
export { RssConnector, parseRssItems, parsePubDate, extractLinkHref } from './connectors/base/RssConnector'
export { NasaConnector } from './connectors/sources/nasa'
export { WhoConnector } from './connectors/sources/who'
export { UnConnector } from './connectors/sources/un'
export { GdacsConnector } from './connectors/sources/gdacs'
export { NwsConnector } from './connectors/sources/nws'
export { SouthAfricaGovConnector } from './connectors/sources/southAfricaGov'
export { NamibiaNewEraConnector } from './connectors/sources/namibiaNewEra'
export { ZimbabweZbcConnector } from './connectors/sources/zimbabweZbc'
export { SAnewsConnector, SAnewsFeaturesConnector } from './connectors/sources/sanews'
export { SouthAfricaGovEventsConnector } from './connectors/sources/southAfricaGovEvents'
export { SouthAfricaPresidencyEventsConnector } from './connectors/sources/southAfricaPresidencyEvents'
export { UsFederalReserveConnector } from './connectors/sources/usFederalReserve'
export { UsWhiteHouseConnector } from './connectors/sources/usWhiteHouse'
export { UkGovernmentConnector } from './connectors/sources/ukGovernment'
export { BankOfEnglandConnector } from './connectors/sources/bankOfEngland'
export { EuCommissionConnector } from './connectors/sources/euCommission'
export { EcbConnector } from './connectors/sources/ecb'

export { ConnectorManager } from './manager/ConnectorManager'
export type { ConnectorManagerOptions } from './manager/ConnectorManager'
export { consoleLogger } from './manager/logger'
export { recordConnectorRun } from './manager/supabaseConnectorRuns'
export type { SupabaseConnectorRunsConfig } from './manager/supabaseConnectorRuns'
export { InMemoryMetricsStore } from './manager/metrics'
export { withRetry } from './manager/retry'
export { runWithConcurrency } from './manager/concurrency'
export { DEFAULT_RETRY_POLICY } from './manager/types'
export type {
  CollectionResult,
  CollectionStatus,
  ConnectorMetricsSnapshot,
  ConnectorRunResult,
  LogEntry,
  Logger,
  MetricsStore,
  RetryPolicy,
  RunStatus,
} from './manager/types'

export { computeContentHash, checkForDuplicate, InMemoryDuplicateIndex } from './pipeline/dedupe'
export type { DedupeOutcome, DuplicateIndex, ExistingRecord } from './pipeline/dedupe'
export { computeAverageConnectorLatency, InMemoryPipelineMetrics } from './pipeline/metrics'
export type {
  PipelineMetrics,
  PipelineMetricsSnapshot,
  PriorityBucket,
  ProcessingOutcome,
  ProcessingRecord,
} from './pipeline/metrics'
export { InMemoryRepository } from './pipeline/repository'
export type { EmbeddingRecord, Repository } from './pipeline/repository'
export { RepositoryError, SupabaseRepository } from './pipeline/supabaseRepository'
export type { SupabaseRepositoryConfig } from './pipeline/supabaseRepository'
export { processMessage } from './pipeline/processMessage'
export type { ProcessMessageDeps, ProcessMessageOutcome } from './pipeline/processMessage'

export { NullAiProvider } from './pipeline/ai/nullProvider'
export { ClaudeAiProvider } from './pipeline/ai/claudeProvider'
export type { ClaudeAiProviderConfig } from './pipeline/ai/claudeProvider'
export { enrichEvent, selectAiProvider } from './pipeline/ai/enrichmentPipeline'
export type { AiProviderEnv, AiSummaryRecord, EnrichmentOutcome } from './pipeline/ai/enrichmentPipeline'
export type { AiEnrichmentContext, AiEnrichmentResult, AiProvider } from './pipeline/ai/types'

export { ConfigurableTrustRegistry, createDefaultTrustRegistry, DEFAULT_CATEGORY_TRUST } from './pipeline/trust'
export type { SourceCategory, SourceTrustProfile, TrustRegistry } from './pipeline/trust'
export {
  CATEGORY_BASE_WEIGHT,
  CATEGORY_IMPACT_DEFAULTS,
  computePriorityScore,
  DEFAULT_PRIORITY_WEIGHTS,
} from './pipeline/priority'
export type { AiImpactScores, CategoryImpactDefaults, PriorityInputs, PriorityWeights } from './pipeline/priority'
export { mergeEvents } from './pipeline/mergeEngine'
export type { MergeInputs, MergeResult } from './pipeline/mergeEngine'
export { getTimeline, recordTimelineEntries, recordTimelineEntry } from './pipeline/timeline'

export { InMemoryEntityGraphStore, normalizeName } from './pipeline/entityGraph'
export type { Entity, EntityGraphStore, EntityType, Relationship, RelationshipType } from './pipeline/entityGraph'
export { SupabaseEntityGraphStore } from './pipeline/supabaseEntityGraphStore'
export type { SupabaseEntityGraphStoreConfig } from './pipeline/supabaseEntityGraphStore'
export { getEntityDetail, listEntities, parseListEntitiesQuery } from './api/entitiesApi'
export type {
  ConnectedEntity,
  EntitiesApiConfig,
  EntityCount,
  EntityDetail,
  EntityRecord,
  ListEntitiesQuery,
  ListEntitiesResult,
  RelationshipEvidence,
} from './api/entitiesApi'

export { GeminiEntityBriefProvider, PROMPT_VERSION as ENTITY_BRIEF_PROMPT_VERSION } from './pipeline/ai/entityBriefProvider'
export type {
  CitedStatement,
  EntityBrief,
  EntityBriefEvidenceEvent,
  EntityBriefEvidenceRelationship,
  EntityBriefInput,
  EntityBriefProvider,
} from './pipeline/ai/entityBriefProvider'

export { GeminiEntityExtractionProvider, PROMPT_VERSION as ENTITY_EXTRACTION_PROMPT_VERSION } from './pipeline/ai/entityExtractionProvider'
export type {
  EntityExtractionInput,
  EntityExtractionProvider,
  EntityExtractionResult,
  EntityRelationshipType,
  ExtractedEntityCandidate,
  ExtractedRelationshipCandidate,
} from './pipeline/ai/entityExtractionProvider'
export {
  CONFIDENCE_THRESHOLD as ENTITY_EXTRACTION_CONFIDENCE_THRESHOLD,
  DEFAULT_EXTRACTION_BATCH_SIZE,
  evidenceAppearsInSource,
  extractEntitiesForEvent,
  hasCurrentExtraction,
  runEntityExtractionBatch,
  selectEventsNeedingExtraction,
} from './pipeline/entityExtraction'
export type { EntityExtractionBatchSummary, EntityExtractionConfig, ExtractEntitiesForEventResult } from './pipeline/entityExtraction'

export function createDefaultRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry()
  registry.register(new NasaConnector())
  registry.register(new WhoConnector())
  registry.register(new UnConnector())
  registry.register(new GdacsConnector())
  registry.register(new NwsConnector())
  registry.register(new SouthAfricaGovConnector())
  registry.register(new NamibiaNewEraConnector())
  registry.register(new ZimbabweZbcConnector())
  registry.register(new SAnewsConnector())
  registry.register(new SAnewsFeaturesConnector())
  registry.register(new SouthAfricaGovEventsConnector())
  registry.register(new SouthAfricaPresidencyEventsConnector())
  registry.register(new UsFederalReserveConnector())
  registry.register(new UsWhiteHouseConnector())
  registry.register(new UkGovernmentConnector())
  registry.register(new BankOfEnglandConnector())
  registry.register(new EuCommissionConnector())
  registry.register(new EcbConnector())
  return registry
}

export function createDefaultManager(options?: ConnectorManagerOptions): ConnectorManager {
  return new ConnectorManager(createDefaultRegistry(), options)
}
