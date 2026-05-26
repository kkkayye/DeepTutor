"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Code2, Copy, Check, ExternalLink, Maximize2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Mermaid } from "@/components/Mermaid";
import { prepareIframeHtml } from "@/lib/iframe-html";
import type { VisualizeResult } from "@/lib/visualize-types";

function ChartJsRenderer({ config }: { config: string }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!canvasRef.current) return;

      try {
        const ChartModule = await import("chart.js/auto");
        const Chart = ChartModule.default;

        if (chartRef.current) {
          (chartRef.current as InstanceType<typeof Chart>).destroy();
          chartRef.current = null;
        }

        const parsedConfig = new Function(
          `"use strict"; return (${config});`,
        )();

        if (cancelled) return;

        chartRef.current = new Chart(canvasRef.current, parsedConfig);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t("Failed to render chart"),
          );
        }
      }
    }

    void render();

    return () => {
      cancelled = true;
      if (chartRef.current) {
        (chartRef.current as { destroy: () => void }).destroy();
        chartRef.current = null;
      }
    };
  }, [config, t]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {t("Chart rendering error")}
        </p>
        <pre className="mt-2 whitespace-pre-wrap text-xs text-red-500">
          {error}
        </pre>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ maxHeight: 480 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function HtmlRenderer({
  html,
  autoHeight = false,
}: {
  html: string;
  autoHeight?: boolean;
}) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(560);

  const prepared = useMemo(
    () => prepareIframeHtml(html || "", { fitFrame: autoHeight }),
    [html, autoHeight],
  );

  useEffect(() => {
    if (!autoHeight) return;

    const overflowAllowsScroll = (value: string) =>
      /auto|scroll|overlay/.test(value);

    const scrollFrameHost = (deltaX: number, deltaY: number) => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      let node = iframe.parentElement;
      while (node) {
        const style = window.getComputedStyle(node);
        const canScrollY =
          deltaY !== 0 &&
          overflowAllowsScroll(style.overflowY) &&
          node.scrollHeight > node.clientHeight + 1;
        const canScrollX =
          deltaX !== 0 &&
          overflowAllowsScroll(style.overflowX) &&
          node.scrollWidth > node.clientWidth + 1;

        if (canScrollY || canScrollX) {
          const beforeTop = node.scrollTop;
          const beforeLeft = node.scrollLeft;
          node.scrollBy({
            left: canScrollX ? deltaX : 0,
            top: canScrollY ? deltaY : 0,
            behavior: "auto",
          });
          if (
            node.scrollTop !== beforeTop ||
            node.scrollLeft !== beforeLeft
          ) {
            return;
          }
        }

        node = node.parentElement;
      }

      window.scrollBy({ left: deltaX, top: deltaY, behavior: "auto" });
    };

    const onMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const data = event.data as
        | {
            source?: string;
            type?: string;
            height?: unknown;
            deltaX?: unknown;
            deltaY?: unknown;
          }
        | undefined;
      if (data?.source !== "socartes-html-iframe") {
        return;
      }

      if (data.type === "scroll") {
        const deltaX = Number(data.deltaX) || 0;
        const deltaY = Number(data.deltaY) || 0;
        if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
        if (deltaX === 0 && deltaY === 0) return;
        scrollFrameHost(deltaX, deltaY);
        return;
      }

      if (data.type !== "resize") return;

      const measured = Number(data.height);
      if (!Number.isFinite(measured) || measured <= 0) return;
      const nextHeight = Math.min(Math.max(Math.ceil(measured), 480), 20000);
      setIframeHeight((current) =>
        Math.abs(current - nextHeight) > 4 ? nextHeight : current,
      );
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [autoHeight]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = prepared;
  }, [prepared]);

  const handleOpenInNewTab = () => {
    try {
      const blob = new Blob([prepared], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Best-effort cleanup; the new tab keeps its own reference.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={handleOpenInNewTab}
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--background)]/90 px-2 py-1 text-[10px] font-medium text-[var(--muted-foreground)] backdrop-blur transition-colors hover:text-[var(--foreground)]"
        title={t("Open in new tab")}
      >
        <ExternalLink size={10} strokeWidth={1.8} />
        {t("Open")}
      </button>
      <iframe
        ref={iframeRef}
        title={t("HTML visualization")}
        sandbox="allow-scripts"
        scrolling={autoHeight ? "no" : undefined}
        className="block w-full rounded-lg border border-[var(--border)] bg-white"
        style={
          autoHeight
            ? { minHeight: 480, height: iframeHeight }
            : { minHeight: 480, height: 560 }
        }
      />
    </div>
  );
}

function SvgRenderer({ svg }: { svg: string }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const sanitizedSvg = useMemo(() => svg.trim(), [svg]);
  const error = sanitizedSvg.startsWith("<svg")
    ? null
    : t("Invalid SVG: does not start with <svg");

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {t("SVG rendering error")}
        </p>
        <pre className="mt-2 whitespace-pre-wrap text-xs text-red-500">
          {error}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
    />
  );
}

function renderVisualization(
  result: VisualizeResult,
  options: { htmlAutoHeight?: boolean } = {},
) {
  if (result.render_type === "svg") {
    return <SvgRenderer svg={result.code.content} />;
  }
  if (result.render_type === "mermaid") {
    return <Mermaid chart={result.code.content} />;
  }
  if (result.render_type === "html") {
    return (
      <HtmlRenderer
        html={result.code.content}
        autoHeight={options.htmlAutoHeight}
      />
    );
  }
  return <ChartJsRenderer config={result.code.content} />;
}

export default function VisualizationViewer({
  result,
  htmlAutoHeight = false,
}: {
  result: VisualizeResult;
  htmlAutoHeight?: boolean;
}) {
  const { t } = useTranslation();
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // HTML iframe already provides its own "Open in new tab" affordance; the
  // sandboxed iframe also doesn't behave well inside a re-rendered modal.
  const supportsFullscreen = result.render_type !== "html";

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.code.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API may be unavailable */
    }
  };

  return (
    <div className="space-y-3">
      {/* Visualization area */}
      <div
        className={`relative ${
          result.render_type === "html"
            ? "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]"
            : "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
        }`}
      >
        {supportsFullscreen && (
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            title={t("Fullscreen")}
            className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--background)]/90 px-2 py-1 text-[10px] font-medium text-[var(--muted-foreground)] backdrop-blur transition-colors hover:text-[var(--foreground)]"
          >
            <Maximize2 size={10} strokeWidth={1.8} />
            {t("Fullscreen")}
          </button>
        )}
        {renderVisualization(result, { htmlAutoHeight })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowCode((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          <Code2 size={12} strokeWidth={1.8} />
          {showCode ? t("Hide code") : t("Show code")}
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          {copied ? (
            <Check size={12} strokeWidth={1.8} />
          ) : (
            <Copy size={12} strokeWidth={1.8} />
          )}
          {copied ? t("Copied") : t("Copy code")}
        </button>

        <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]/50">
          {result.render_type === "svg"
            ? "SVG"
            : result.render_type === "mermaid"
              ? `Mermaid · ${result.analysis.chart_type || "diagram"}`
              : result.render_type === "html"
                ? `HTML · ${result.analysis.chart_type || "interactive"}`
                : `Chart.js · ${result.analysis.chart_type || "chart"}`}
        </span>
      </div>

      {/* Code panel */}
      {showCode && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[#1f2937]">
          <div className="border-b border-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">
            {result.code.language}
          </div>
          <pre className="max-h-80 overflow-auto p-4 text-[13px] leading-relaxed text-[#d1d5db]">
            <code>{result.code.content}</code>
          </pre>
        </div>
      )}

      {/* Review notes */}
      {result.review.changed && result.review.review_notes && (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {t("Review")}: {result.review.review_notes}
        </p>
      )}

      {/* Fullscreen overlay */}
      {fullscreen && supportsFullscreen && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
        >
          <div className="mb-2 flex shrink-0 items-center justify-between text-white">
            <div className="text-xs uppercase tracking-wider opacity-80">
              {result.render_type === "svg"
                ? "SVG"
                : result.render_type === "mermaid"
                  ? `Mermaid · ${result.analysis.chart_type || "diagram"}`
                  : `Chart.js · ${result.analysis.chart_type || "chart"}`}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFullscreen(false);
              }}
              title={t("Close")}
              className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-white/20"
            >
              <X size={12} strokeWidth={1.8} />
              {t("Close")}
            </button>
          </div>
          <div
            className="flex flex-1 items-center justify-center overflow-auto rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-[1600px]">
              {renderVisualization(result)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
