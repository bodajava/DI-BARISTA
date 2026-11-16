"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, ChevronLeft, Moon, Square, Sun } from "lucide-react";

interface IToolCallItem {
  id: string;
  name: string;
  target: string;
  status: "completed" | "running";
  output?: string;
}

interface IMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  latency?: string;
  tokens?: string;
  toolCalls?: IToolCallItem[];
}

const SUGGESTED_PROMPTS = [
  "Summarize total revenue, paid orders, AOV, and top selling coffees.",
  "Which products have high views but low conversions or low stock?",
  "List active promo coupons and identify top repeat spenders.",
];

export function SignalAiAnalystClient() {
  const [messages, setMessages] = useState<IMessage[]>([
    {
      id: "welcome-msg",
      role: "assistant",
      content:
        "Connected to live DIBARESTA CAFFE MongoDB analytics, inventory, order, customer, and coupon collections. Ask any operational or financial question below.",
      model: "gemini-2.5-flash · live DB context",
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, isThinking]);

  const stopStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setIsThinking(false);
  };

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isStreaming) return;

    setInput("");

    const userMsg: IMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const assistantId = `asst-${Date.now() + 1}`;
    const historyPayload = messages
      .filter((m) => m.id !== "welcome-msg")
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/admin/ai-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Request failed (${response.status})`);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          toolCalls: [],
        },
      ]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;

          try {
            const evt = JSON.parse(line.slice(5).trim()) as {
              type: "tool" | "delta" | "done" | "error";
              tool?: {
                id: string;
                name: string;
                status: "running" | "done";
                summary: string;
              };
              text?: string;
              model?: string;
              latencyMs?: number;
              tokenCount?: number;
              error?: string;
            };

            if (evt.type === "tool" && evt.tool) {
              const t = evt.tool;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const existing = m.toolCalls || [];
                  const nextTool: IToolCallItem = {
                    id: t.id,
                    name: t.name,
                    target: "MongoDB Analytics & Orders",
                    status: t.status === "done" ? "completed" : "running",
                    output: t.summary,
                  };
                  const idx = existing.findIndex((item) => item.id === t.id);
                  const updatedTools =
                    idx >= 0
                      ? existing.map((item, i) => (i === idx ? nextTool : item))
                      : [...existing, nextTool];
                  return { ...m, toolCalls: updatedTools };
                }),
              );
            } else if (evt.type === "delta" && evt.text) {
              setIsThinking(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + evt.text }
                    : m,
                ),
              );
            } else if (evt.type === "done") {
              setIsThinking(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        model: evt.model,
                        latency: evt.latencyMs ? `${evt.latencyMs}ms` : undefined,
                        tokens: evt.tokenCount
                          ? `${evt.tokenCount} tokens`
                          : undefined,
                      }
                    : m,
                ),
              );
            } else if (evt.type === "error") {
              setIsThinking(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content:
                          m.content ||
                          `Error: ${evt.error || "Unable to complete analysis"}`,
                      }
                    : m,
                ),
              );
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content:
              err instanceof Error
                ? `Unable to analyze database: ${err.message}`
                : "AI Analyst request failed",
          },
        ]);
      }
    } finally {
      setIsThinking(false);
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <div
      className={`theme-signal-ai min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col transition-colors duration-200 ${
        isDark ? "dark" : ""
      }`}
    >
      {/* 56px Liquid Glass Top Navigation */}
      <header className="liquid-glass sticky top-0 z-40 h-14 px-6 flex items-center justify-between border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors font-mono"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Admin Console</span>
          </Link>

          <span className="text-[var(--border)]">/</span>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-[var(--foreground)] tracking-tight">
              AI Database Analyst
            </span>
            <div className="liquid-glass-pill px-2 py-0.5 text-[10px] font-mono flex items-center gap-1.5 text-[var(--foreground)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#e8590c] animate-pulse" />
              <span>LIVE REASONING</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-[var(--muted-foreground)] hidden sm:inline">
            DB-Grounded Streaming
          </span>

          <button
            type="button"
            onClick={() => setIsDark((d) => !d)}
            className="p-1.5 rounded-full border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Toggle Theme"
          >
            {isDark ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* Centered 720px Chat Thread Column */}
      <main className="flex-1 max-w-[720px] w-full mx-auto px-4 py-8 pb-40 space-y-8">
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendPrompt(q)}
                className="ai-btn ai-btn-outline text-xs py-1.5 px-3"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, mIdx) => {
          const isUser = msg.role === "user";
          const isCurrentlyStreamingMsg =
            isStreaming && mIdx === messages.length - 1 && !isUser;

          return (
            <div key={msg.id} className="space-y-3">
              {isUser ? (
                <div className="ai-turn-user whitespace-pre-wrap">
                  {msg.content}
                </div>
              ) : (
                <div className="ai-turn-assistant space-y-4">
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {msg.toolCalls.map((tc, idx) => {
                        const tcId = `${msg.id}-tc-${idx}`;
                        const isExpanded = expandedTool === tcId;

                        return (
                          <div key={tc.id || idx} className="space-y-1">
                            <div
                              onClick={() =>
                                setExpandedTool(isExpanded ? null : tcId)
                              }
                              className="ai-tool-call select-none"
                            >
                              <span
                                className={`ai-tool-status ${
                                  tc.status === "completed" ? "done" : ""
                                }`}
                              />
                              <span className="font-semibold text-[var(--foreground)]">
                                {tc.name}
                              </span>
                              <span className="text-[var(--muted-foreground)] truncate max-w-[280px]">
                                {tc.target}
                              </span>
                              <span className="ml-auto text-[10px] uppercase font-mono text-[var(--muted-foreground)]">
                                {isExpanded ? "Collapse" : "Inspect"}
                              </span>
                            </div>

                            {isExpanded && tc.output && (
                              <div className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] font-mono text-xs text-[var(--muted-foreground)]">
                                <div className="text-[10px] text-[var(--signal)] font-semibold mb-1">
                                  OUTPUT:
                                </div>
                                <div className="text-[var(--foreground)] leading-relaxed">
                                  {tc.output}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="text-[15px] leading-[1.65] whitespace-pre-wrap text-[var(--foreground)]">
                    {msg.content}
                    {isCurrentlyStreamingMsg && <span className="ai-caret" />}
                  </div>

                  {(msg.model || msg.latency || msg.tokens) && (
                    <div className="flex items-center gap-3 text-xs font-mono text-[var(--muted-foreground)] pt-1">
                      {msg.model && <span>{msg.model}</span>}
                      {msg.latency && (
                        <>
                          <span>·</span>
                          <span>{msg.latency}</span>
                        </>
                      )}
                      {msg.tokens && (
                        <>
                          <span>·</span>
                          <span>{msg.tokens}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isThinking && (
          <div className="ai-turn-assistant flex items-center gap-2 pt-2">
            <div className="ai-thinking-dots">
              <span className="ai-thinking-dot" />
              <span className="ai-thinking-dot" />
              <span className="ai-thinking-dot" />
            </div>
            <span className="text-xs font-mono text-[var(--muted-foreground)]">
              Querying database indexes &amp; synthesizing answer...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Floating 16px-Radius Composer Card Pinned to Bottom */}
      <div className="fixed bottom-6 inset-x-0 z-30 px-4 pointer-events-none">
        <div className="max-w-[720px] mx-auto pointer-events-auto">
          <div className="ai-composer liquid-glass flex items-end gap-3 rounded-[var(--radius-lg)] p-2.5">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendPrompt(input);
                }
              }}
              placeholder="Ask natural language questions about revenue, top products, inventory, or coupons... (Enter to send)"
              className="flex-1 bg-transparent border-0 resize-none text-[14px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none p-2 leading-relaxed"
            />

            <button
              type="button"
              onClick={isStreaming ? stopStream : () => sendPrompt(input)}
              disabled={!isStreaming && !input.trim()}
              className={`h-9 w-9 rounded-full flex items-center justify-center transition-all ${
                isStreaming || input.trim()
                  ? "bg-[#e8590c] text-white hover:opacity-90 active:scale-95 shadow-sm"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed"
              }`}
              aria-label={isStreaming ? "Stop Streaming" : "Send Message"}
            >
              {isStreaming ? (
                <Square className="h-3.5 w-3.5 fill-current" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="text-[11px] font-mono text-[var(--muted-foreground)] text-center mt-2">
            Signal AI Agent · Grounded on live DIBARESTA roastery telemetry
          </div>
        </div>
      </div>
    </div>
  );
}
