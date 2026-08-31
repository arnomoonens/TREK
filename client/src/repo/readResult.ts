export type ReadSource = 'network' | 'cache'
export type CacheStatus = 'unknown' | 'available' | 'empty' | 'unavailable'

/** Metadata that lets consumers distinguish an empty cache from a known-empty resource. */
export interface ReadMeta {
  source: ReadSource
  cacheStatus: CacheStatus
}

export type ReadResult<T extends object> = T & ReadMeta

export function unavailableRead<T extends object>(value: T): ReadResult<T> {
  return {
    ...value,
    source: 'cache',
    cacheStatus: 'unavailable',
  }
}
