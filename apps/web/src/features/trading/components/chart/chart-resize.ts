import type { IChartApi } from "lightweight-charts";

type ResizeObserverCallback = () => void;

export type ChartResizeObserver = Readonly<{
  disconnect(): void;
  observe(target: Element): void;
}>;

export type ChartResizeOptions = Readonly<{
  cancelFrame?: (frame: number) => void;
  createObserver?: (callback: ResizeObserverCallback) => ChartResizeObserver;
  requestFrame?: (callback: FrameRequestCallback) => number;
}>;

/** Keeps the imperative chart sized to its CSS container without React rerenders. */
export function observeChartSize(
  chart: Pick<IChartApi, "applyOptions">,
  container: Element,
  options: ChartResizeOptions = {},
): () => void {
  const requestFrame = options.requestFrame ?? window.requestAnimationFrame.bind(window);
  const cancelFrame = options.cancelFrame ?? window.cancelAnimationFrame.bind(window);
  const createObserver =
    options.createObserver ?? ((callback) => new ResizeObserver(callback) as ChartResizeObserver);
  let frame: number | undefined;

  const resize = (): void => {
    const { height, width } = container.getBoundingClientRect();
    const nextHeight = Math.round(height);
    const nextWidth = Math.round(width);
    if (nextHeight < 1 || nextWidth < 1) return;

    chart.applyOptions({ height: nextHeight, width: nextWidth });
  };
  const scheduleResize = (): void => {
    if (frame !== undefined) return;
    frame = requestFrame(() => {
      frame = undefined;
      resize();
    });
  };

  resize();
  const observer = createObserver(scheduleResize);
  observer.observe(container);

  return () => {
    observer.disconnect();
    if (frame !== undefined) cancelFrame(frame);
  };
}
