import {
  createElement,
  Profiler,
  type ComponentType,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from "react";

type RenderMeasurement = {
  commits: number;
  totalActualMs: number;
  maxActualMs: number;
  lastBaseMs: number;
};

/** Test-only aggregates: no per-tick trace, account data or production instrumentation. */
export class RenderProfile {
  private readonly measurements = new Map<string, RenderMeasurement>();
  private readonly calls = new Map<string, number>();
  private readonly probedFunctions = new Set<string>();

  readonly onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration) => {
    if (phase === "mount") return;
    const previous = this.measurements.get(id) ?? {
      commits: 0,
      totalActualMs: 0,
      maxActualMs: 0,
      lastBaseMs: 0,
    };
    this.measurements.set(id, {
      commits: previous.commits + 1,
      totalActualMs: previous.totalActualMs + actualDuration,
      maxActualMs: Math.max(previous.maxActualMs, actualDuration),
      lastBaseMs: baseDuration,
    });
  };

  recordCall(id: string): void {
    this.registerProbe(id);
    this.calls.set(id, this.functionCalls(id) + 1);
  }

  registerProbe(id: string): void {
    this.probedFunctions.add(id);
  }

  functionCalls(id: string): number {
    return this.calls.get(id) ?? 0;
  }

  commits(id: string): number {
    return this.measurements.get(id)?.commits ?? 0;
  }

  reset(): void {
    this.measurements.clear();
    this.calls.clear();
  }

  report(ids: readonly string[]) {
    return ids.map((id) => {
      const measurement = this.measurements.get(id);
      return {
        id,
        commits: this.commits(id),
        functionCalls: this.probedFunctions.has(id) ? this.functionCalls(id) : null,
        totalActualMs: Number((measurement?.totalActualMs ?? 0).toFixed(3)),
        maxActualMs: Number((measurement?.maxActualMs ?? 0).toFixed(3)),
        lastBaseMs: Number((measurement?.lastBaseMs ?? 0).toFixed(3)),
      };
    });
  }
}

export const tickerRenderProfile = new RenderProfile();

/** Delegate the actual function, including hooks; count calls separately from child commits. */
export function probeFunction<Props>(id: string, component: (props: Props) => ReactNode) {
  tickerRenderProfile.registerProbe(id);
  return function ProfiledFunction(props: Props) {
    tickerRenderProfile.recordCall(id);
    return component(props);
  };
}

/** Retains the actual component (including React.memo) inside a test-only Profiler. */
export function profileComponent<Props extends object>(
  id: string | ((props: Props) => string),
  component: ComponentType<Props>,
) {
  return function ProfiledComponent(props: Props) {
    return createElement(
      Profiler,
      { id: typeof id === "string" ? id : id(props), onRender: tickerRenderProfile.onRender },
      createElement(component, props),
    );
  };
}
