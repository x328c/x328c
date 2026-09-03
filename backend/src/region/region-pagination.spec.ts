import { readRegionPage, RegionPhase } from './region-pagination';

describe('cross-page region priority', () => {
  it.each([0, 1, 2, 3, 4, 5])(
    'pages %i start matches ahead of all through matches without omissions',
    async (startCount) => {
      const data = {
        start: Array.from({ length: startCount }, (_, i) => 100 - i),
        through: [300, 299, 298],
      };
      const read = jest.fn(async (phase: RegionPhase, cursor: number | undefined, take: number) =>
        data[phase].filter((id) => cursor === undefined || id < cursor).slice(0, take),
      );
      const seen: number[] = [];
      let phase: RegionPhase = 'start';
      let cursor: number | undefined;
      for (let page = 0; page < 10; page++) {
        const result: { rows: Array<{ value: number; phase: RegionPhase }>; hasMore: boolean } =
          await readRegionPage<number, number>({ limit: 2, phase, cursor, read });
        seen.push(...result.rows.map((row) => row.value));
        if (!result.hasMore) break;
        const last = result.rows.at(-1)!;
        phase = last.phase;
        cursor = last.value;
      }
      expect(seen).toEqual([...data.start, ...data.through]);
      expect(read.mock.calls.every((call) => call[2] >= 1 && call[2] <= 3)).toBe(true);
    },
  );
});
