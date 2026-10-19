/** 瀑布流：卡片间距（px） */
export const MASONRY_GAP = 16;

export interface Placement {
  column: number;
  top: number;
}

export function columnsForWidth(width: number): number {
  if (width >= 1100) return 4;
  if (width >= 768) return 3;
  if (width >= 480) return 2;
  return 1;
}

/** 依次放进当前最矮的一列（Pinterest / Keep 的排法） */
export function placeItems(heights: number[], columns: number): Placement[] {
  const columnHeights = new Array(columns).fill(0);
  return heights.map((h) => {
    let column = 0;
    for (let i = 1; i < columns; i++) {
      if (columnHeights[i] < columnHeights[column] - 0.5) column = i;
    }
    const placement = { column, top: columnHeights[column] };
    columnHeights[column] += h + MASONRY_GAP;
    return placement;
  });
}
