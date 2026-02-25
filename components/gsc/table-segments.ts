export type CompareClicksRow = {
  compareClicks?: number | null;
  clicks: number;
};

export type SegmentedRows<T> = {
  all: T[];
  growing: T[];
  decaying: T[];
};

export function segmentRowsByClickDelta<T extends CompareClicksRow>(
  rows: T[],
): SegmentedRows<T> {
  const growing: T[] = [];
  const decaying: T[] = [];

  for (const row of rows) {
    if (row.compareClicks == null) continue;
    const delta = row.clicks - row.compareClicks;
    if (delta > 0) growing.push(row);
    else if (delta < 0) decaying.push(row);
  }

  growing.sort(
    (a, b) =>
      b.clicks - (b.compareClicks ?? 0) - (a.clicks - (a.compareClicks ?? 0)),
  );
  decaying.sort(
    (a, b) =>
      a.clicks - (a.compareClicks ?? 0) - (b.clicks - (b.compareClicks ?? 0)),
  );

  return {
    all: rows,
    growing,
    decaying,
  };
}
