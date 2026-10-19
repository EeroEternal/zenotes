import {
  Children,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { columnsForWidth, MASONRY_GAP as GAP, placeItems, type Placement } from '@/lib/masonry';

/**
 * 真·瀑布流：卡片按「最短列」依次放置（像 Pinterest / Google Keep）。
 * CSS column-count 不行——它是按列填满、底部对齐，看起来还是普通网格。
 */
export function MasonryGrid({ children, className }: { children: ReactNode; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const items = Children.toArray(children);

  const [columns, setColumns] = useState(() =>
    typeof window === 'undefined' ? 4 : columnsForWidth(window.innerWidth),
  );
  const columnsRef = useRef(columns);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const placementsRef = useRef<Placement[]>([]);

  const layout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    if (width <= 0) return;

    const count = columnsForWidth(width);
    if (count !== columnsRef.current) {
      columnsRef.current = count;
      setColumns(count);
    }

    const heights = itemRefs.current
      .slice(0, items.length)
      .map((el) => el?.getBoundingClientRect().height ?? 0);

    const next = placeItems(heights, count);
    const columnHeights = new Array(count).fill(0);
    next.forEach((p, i) => {
      columnHeights[p.column] = p.top + heights[i] + GAP;
    });

    const prev = placementsRef.current;
    const unchanged =
      prev.length === next.length &&
      next.every((p, i) => p.column === prev[i].column && Math.abs(p.top - prev[i].top) < 0.5);
    if (!unchanged) {
      placementsRef.current = next;
      setPlacements(next);
    }

    const total = Math.max(0, ...columnHeights) - GAP;
    const height = `${Math.round(total)}px`;
    if (container.style.height !== height) container.style.height = height;
  }, [items.length]);

  // 首次渲染后立即量高度并定位（useLayoutEffect 在浏览器绘制前完成，不会闪）
  useLayoutEffect(() => {
    layout();
  }, [layout, items.length]);

  // 容器宽度变化（换行/缩放）或卡片高度变化（图片加载、编辑）时重新排布
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => layout());
    ro.observe(container);
    itemRefs.current.slice(0, items.length).forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [layout, items.length]);

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative' }}>
      {items.map((child, i) => {
        const placement = placements[i];
        return (
          <div
            key={i}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            style={{
              position: 'absolute',
              width: `calc((100% - ${(columns - 1) * GAP}px) / ${columns})`,
              left: `calc(${placement?.column ?? 0} * (100% + ${GAP}px) / ${columns})`,
              top: placement?.top ?? 0,
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
