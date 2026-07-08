import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Structured log so it's easy to grep in browser logs / future error sink.
    console.error("[ErrorBoundary]", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  reset = () => {
    this.setState({ hasError: false, message: "" });
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">{this.state.message}</p>
        <Button onClick={this.reset}>Reload app</Button>
      </div>
    );
  }
}
