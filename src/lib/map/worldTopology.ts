import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { FeatureCollection, GeometryObject } from 'geojson'

export interface CountryFeatureProperties {
  name: string
}

export type CountryFeatureCollection = FeatureCollection<GeometryObject, CountryFeatureProperties>

let cached: Promise<CountryFeatureCollection> | null = null

/**
 * Real, legitimate country boundary data (Natural Earth, via the `world-atlas`
 * npm package) — never hand-drawn. Loaded dynamically (not a static
 * top-level import) so the ~90KB TopoJSON file lands in its own chunk
 * rather than the main bundle; `/map` is one route among several with no
 * other code-splitting today, and most visits never touch it. Memoized
 * module-level so repeated mounts of the map route don't re-fetch it.
 */
export function loadWorldTopology(): Promise<CountryFeatureCollection> {
  if (!cached) {
    cached = import('world-atlas/countries-110m.json').then((mod) => {
      const topology = (mod.default ?? mod) as unknown as Topology
      const countries = topology.objects.countries as GeometryCollection<CountryFeatureProperties>
      return feature(topology, countries) as CountryFeatureCollection
    })
  }
  return cached
}
