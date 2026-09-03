export type RegionPhase = 'start' | 'through';

/** Fetch at most limit + 1 rows across both disjoint partitions, before paging. */
export async function readRegionPage<T, C>(options: {
  limit: number;
  phase?: RegionPhase;
  cursor?: C;
  read: (phase: RegionPhase, cursor: C | undefined, take: number) => Promise<T[]>;
}) {
  const phase = options.phase ?? 'start';
  const first = await options.read(phase, options.cursor, options.limit + 1);
  const rows = first.map((value) => ({ value, phase }));
  if (phase === 'start' && rows.length < options.limit + 1) {
    const remaining = await options.read('through', undefined, options.limit + 1 - rows.length);
    rows.push(...remaining.map((value) => ({ value, phase: 'through' as const })));
  }
  return { rows: rows.slice(0, options.limit), hasMore: rows.length > options.limit };
}
