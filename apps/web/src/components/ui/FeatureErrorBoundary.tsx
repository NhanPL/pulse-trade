"use client";

import { Component, type ReactNode } from "react";

import { reportFrontendError } from "@/lib/observability/browser-error-reporting";
import type { FrontendErrorKind } from "@/lib/observability/frontend-reporter";
import { ErrorState } from "./ErrorState";

type FeatureErrorBoundaryProps = Readonly<{
  children: ReactNode;
  title: string;
  reportKind: FrontendErrorKind;
  retryLabel?: string;
  description?: string;
  className?: string;
  resetKey?: string;
}>;

export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    reportFrontendError(this.props.reportKind, error);
  }

  componentDidUpdate(previousProps: FeatureErrorBoundaryProps): void {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <ErrorState
        className={this.props.className}
        description={this.props.description ?? "Please try loading this panel again."}
        onRetry={() => this.setState({ failed: false })}
        retryLabel={this.props.retryLabel}
        size="compact"
        title={this.props.title}
      />
    );
  }
}
