"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { usePet } from "@/context/PetContext";
import { usePetAgentTask } from "@/hooks/usePetAgentTask";
import { parseAgentAction, type AgentChatMessage } from "@/lib/page-agent-types";

const QUICK_PROMPT_KEYS = [
  "pet:dialog.quick.look",
  "pet:dialog.quick.tasks",
  "pet:dialog.quick.exam",
  "pet:dialog.quick.review",
] as const;

function parseToolContent(content: string): { ok?: boolean; action?: string } {
  try {
    const parsed = JSON.parse(content) as { ok?: unknown; action?: unknown };
    return {
      ok: typeof parsed.ok === "boolean" ? parsed.ok : undefined,
      action: typeof parsed.action === "string" ? parsed.action : undefined,
    };
  } catch {
    return {};
  }
}

function assistantText(message: AgentChatMessage): string {
  if (message.content.trim()) return message.content;
  const args = message.tool_calls?.[0]?.function.arguments;
  const action = args ? parseAgentAction(args) : null;
  if (!action) return "";
  if (action.type === "done") return `done - ${action.message}`;
  return action.message ? `${action.type} - ${action.message}` : action.type;
}

function PetDialogMessage({
  message,
}: {
  message: AgentChatMessage;
}) {
  const { t } = useTranslation();
  if (message.role === "system") return null;

  if (message.role === "tool") {
    const tool = parseToolContent(message.content);
    return (
      <div className="pet-dialog-message pet-dialog-message-tool">
        <span className={`pet-dialog-tool-chip${tool.ok ? " is-ok" : ""}`}>
          {t("pet:dialog.execute")} {tool.action ?? message.content}{" "}
          {tool.ok ? t("pet:dialog.ok") : t("pet:dialog.fail")}
        </span>
      </div>
    );
  }

  const text =
    message.role === "assistant" ? assistantText(message) : message.content;
  if (!text) return null;

  return (
    <div className={`pet-dialog-message is-${message.role}`}>
      <span className="pet-dialog-message-role">
        {message.role === "user"
          ? t("pet:dialog.role.user")
          : t("pet:dialog.role.pet")}
      </span>
      <div className="pet-dialog-message-body">{text}</div>
    </div>
  );
}

export default function PetAgentDialog() {
  const { t } = useTranslation();
  const {
    agentBusy,
    dialogOpen,
    history,
    resetHistory,
    setDialogOpen,
    setWanderPaused,
    wanderPaused,
  } = usePet();
  const { run, cancel, busy } = usePetAgentTask();
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [history.length]);

  if (!dialogOpen) return null;

  const status = agentBusy
    ? t("pet:dialog.status.thinking")
    : wanderPaused
      ? t("pet:dialog.status.stopped")
      : t("pet:dialog.status.wandering");

  const submit = () => {
    const next = input.trim();
    if (!next || busy) return;
    setInput("");
    void run(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  return (
    <section className="pet-dialog" aria-label={t("pet:dialog.title")}>
      <header className="pet-dialog-header">
        <h2>{t("pet:dialog.title")}</h2>
        <div className="pet-dialog-header-actions">
          <button
            type="button"
            className="pet-dialog-ghost-btn"
            onClick={() => setWanderPaused(!wanderPaused)}
          >
            {wanderPaused
              ? t("pet:dialog.resumeWander")
              : t("pet:dialog.pauseWander")}
          </button>
          <button
            type="button"
            className="pet-dialog-icon-btn"
            aria-label={t("pet:dialog.close")}
            onClick={() => setDialogOpen(false)}
          >
            x
          </button>
        </div>
      </header>

      <div className="pet-dialog-status">
        <span>{t("pet:dialog.status.label")}</span>
        <strong>{status}</strong>
      </div>

      <div className="pet-dialog-quick">
        {QUICK_PROMPT_KEYS.map((key) => {
          const prompt = t(key);
          return (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => void run(prompt)}
            >
              {prompt}
            </button>
          );
        })}
      </div>

      <div ref={messagesRef} className="pet-dialog-messages" aria-live="polite">
        {history.length ? (
          history.map((message, index) => (
            <PetDialogMessage key={`${message.role}-${index}`} message={message} />
          ))
        ) : (
          <div className="pet-dialog-empty">{t("pet:dialog.empty")}</div>
        )}
      </div>

      <div className="pet-dialog-footer">
        <button
          type="button"
          className="pet-dialog-reset"
          onClick={resetHistory}
          disabled={busy || history.length === 0}
        >
          {t("pet:dialog.reset")}
        </button>
        <form
          className="pet-dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            rows={1}
            placeholder={t("pet:dialog.placeholder")}
            className="pet-dialog-input"
          />
          {busy ? (
            <button
              type="button"
              className="pet-dialog-send"
              aria-label={t("pet:dialog.stop")}
              onClick={cancel}
            >
              {t("pet:dialog.stopIcon")}
            </button>
          ) : (
            <button
              type="submit"
              className="pet-dialog-send"
              aria-label={t("pet:dialog.send")}
              disabled={!input.trim()}
            >
              {t("pet:dialog.sendIcon")}
            </button>
          )}
        </form>
      </div>
    </section>
  );
}
