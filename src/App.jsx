import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    paperclip: <><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.83-2.83l8.49-8.48" /></>,
    arrowUp: <><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>,
    folder: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" /></>,
    x: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></>,
    check: <><path d="M20 6 9 17l-5-5" /></>,
    square: <><rect x="6" y="6" width="12" height="12" rx="2" /></>,
    chevron: <><path d="m9 6 6 6-6 6" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function MarkdownText({ text }) {
  // Lightweight rendering for the agent's common markdown output.
  const lines = String(text || "").split("\n");

  return (
    <div className="space-y-2 text-[15px] leading-7 text-zinc-600 dark:text-zinc-300">
      {lines.map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-1" />;

        if (line.startsWith("```")) {
          return null;
        }

        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
          return (
            <h3
              key={index}
              className="pt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {heading[2]}
            </h3>
          );
        }

        if (/^\s*[-*]\s+/.test(line)) {
          return (
            <div key={index} className="flex gap-2.5">
              <span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-[#6B5EF0]" />
              <span>{renderInline(line.replace(/^\s*[-*]\s+/, ""))}</span>
            </div>
          );
        }

        if (/^\s*\d+\.\s+/.test(line)) {
          const match = line.match(/^\s*(\d+)\.\s+(.*)$/);
          return (
            <div key={index} className="flex gap-2.5">
              <span className="shrink-0 font-mono text-[13px] text-[#6B5EF0]">{match[1]}.</span>
              <span>{renderInline(match[2])}</span>
            </div>
          );
        }

        return <p key={index}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(value) {
  const parts = String(value).split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded bg-[#6B5EF0]/[0.08] px-1.5 py-0.5 font-mono text-[13px] text-[#4B3FD1] dark:bg-[#6B5EF0]/20 dark:text-[#B8B0FF]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

// Formats a whole-second duration as "3s" or "1:04".
function formatElapsed(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available — fail silently
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[11.5px] transition ${
        copied
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-200"
      }`}
      title="Copy response"
    >
      <Icon name={copied ? "check" : "copy"} size={12.5} />
      {copied ? "copied" : "copy"}
    </button>
  );
}

// A single vertical bar that blinks like a terminal cursor — doubles as the wordmark.
function CursorMark({ size = 16 }) {
  return (
    <span
      className="inline-block w-[3px] rounded-[1px] bg-[#6B5EF0] align-middle animate-[blink_1.1s_steps(1)_infinite]"
      style={{ height: size }}
      aria-hidden="true"
    />
  );
}

// Large, faint braces sitting behind the hero copy — a literal syntax character
// standing in for "code," rather than an abstract decorative shape.
function BraceWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none text-center font-mono text-[220px] font-medium leading-none text-zinc-900/[0.035] dark:text-white/[0.045] sm:text-[300px]"
    >
      {"{ }"}
    </div>
  );
}

export default function App() {
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);
  const abortControllerRef = useRef(null);
  const thinkingIntervalRef = useRef(null);

  const [repository, setRepository] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [error, setError] = useState("");

  const canSend = input.trim().length > 0 && !sending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    // Clean up the timer if the component unmounts mid-response.
    return () => clearInterval(thinkingIntervalRef.current);
  }, []);

  function startThinkingTimer() {
    setThinkingSeconds(0);
    clearInterval(thinkingIntervalRef.current);
    thinkingIntervalRef.current = setInterval(() => {
      setThinkingSeconds((seconds) => seconds + 1);
    }, 1000);
  }

  function stopThinkingTimer() {
    clearInterval(thinkingIntervalRef.current);
    thinkingIntervalRef.current = null;
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  async function uploadRepository(file) {
    if (!file) return;

    setError("");

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Please upload a .zip repository.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("repository", file);

      const response = await fetch(`${API_BASE}/api/repositories/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || data.error || "Repository upload failed.");
      }

      setRepository({
        id: data.repositoryId || data.id,
        name: data.name || file.name.replace(/\.zip$/i, ""),
        originalName: file.name,
      });
      setMessages([]);
    } catch (err) {
      setError(err.message || "Could not upload repository.");
    } finally {
      setUploading(false);
    }
  }

  async function sendMessage(event) {
    event?.preventDefault();

    const message = input.trim();
    if (!message || sending) return;

    setError("");

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setSending(true);
    startThinkingTimer();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          repositoryId: repository?.id || null,
        }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || data.error || "The agent could not answer.");
      }

      const reply =
        data.reply ||
        data.message ||
        data.content ||
        "I couldn't generate a response.";

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
        },
      ]);
    } catch (err) {
      if (err.name === "AbortError") {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "_Generation stopped._",
            stopped: true,
          },
        ]);
      } else {
        setError(err.message || "Something went wrong.");
      }
    } finally {
      setSending(false);
      stopThinkingTimer();
      abortControllerRef.current = null;
    }
  }

  function stopGenerating() {
    abortControllerRef.current?.abort();
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(event);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-zinc-900 dark:bg-[#101114] dark:text-zinc-100">
      <style>{`
        @keyframes blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[blink_1\\.1s_steps\\(1\\)_infinite\\] { animation: none; opacity: 1; }
        }
      `}</style>

      <header className="fixed inset-x-0 top-0 z-20 h-16 border-b border-zinc-200/70 bg-[#FAFAF8]/90 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#101114]/90">
        <div className="mx-auto flex h-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <CursorMark size={17} />
            <span className="text-[15px] font-semibold tracking-tight">RepoPilot</span>
          </div>

          <div className="flex items-center gap-2">
            {sending && (
              <div className="flex items-center gap-1.5 rounded-full border border-[#6B5EF0]/25 bg-[#6B5EF0]/[0.06] px-2.5 py-1 font-mono text-[11.5px] tabular-nums text-[#5B4FE0] dark:border-[#6B5EF0]/30 dark:bg-[#6B5EF0]/10 dark:text-[#B8B0FF]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6B5EF0] opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#6B5EF0]" />
                </span>
                {formatElapsed(thinkingSeconds)}
              </div>
            )}

            {repository && (
              <div className="flex max-w-[160px] items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 font-mono text-[11.5px] text-zinc-500 dark:border-white/10 dark:text-zinc-400 sm:max-w-xs">
                <Icon name="folder" size={12.5} />
                <span className="truncate">{repository.name}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="hidden rounded-lg px-2.5 py-1.5 text-[13px] text-zinc-500 transition hover:bg-zinc-900/5 hover:text-zinc-900 sm:block dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              {repository ? "Change" : "Upload"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-44 pt-28 sm:px-6">
        {messages.length === 0 ? (
          <section className="relative flex flex-1 flex-col items-center justify-center pb-16 text-center">
            <BraceWatermark />

            <div className="relative">
              <h1 className="text-[36px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[46px]">
                Understand your codebase
              </h1>

              <p className="mx-auto mt-4 max-w-md text-[15.5px] leading-7 text-zinc-500 dark:text-zinc-400">
                {repository
                  ? `${repository.name} is ready. Ask RepoPilot to explore, explain, or find anything in the repository.`
                  : "Upload a repository as a .zip and ask RepoPilot to explore it for you."}
              </p>

              {!repository && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#6B5EF0] px-5 py-2.5 text-sm font-medium text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_24px_-8px_rgba(107,94,240,0.55)] transition hover:bg-[#5B4FE0] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Icon name="folder" size={16} />
                      Upload a repository
                    </>
                  )}
                </button>
              )}

              <div className="mx-auto mt-12 flex max-w-lg flex-col divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/70 text-left dark:divide-white/[0.06] dark:border-white/[0.06]">
                {[
                  "Where is authentication implemented?",
                  "Explain the architecture of this project.",
                  "Find the API endpoints in this repository.",
                  "What would break if I change the User model?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={!repository}
                    onClick={() => setInput(prompt)}
                    className="group flex items-center gap-2.5 px-4 py-3 text-[13.5px] text-zinc-600 transition first:rounded-t-xl last:rounded-b-xl hover:bg-[#6B5EF0]/[0.05] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-[#6B5EF0]/[0.08]"
                  >
                    <Icon name="chevron" size={13} />
                    <span className="truncate group-hover:text-zinc-900 dark:group-hover:text-zinc-100">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="space-y-9">
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                {message.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[#6B5EF0]/[0.07] px-4 py-3 text-[15px] leading-6 text-zinc-800 dark:bg-[#6B5EF0]/15 dark:text-zinc-100">
                    {message.content}
                  </div>
                ) : (
                  <div className="w-full max-w-2xl border-l-2 border-[#6B5EF0]/20 pl-4 dark:border-[#6B5EF0]/25">
                    <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      RepoPilot
                    </div>
                    <MarkdownText text={message.content} />
                    {!message.stopped && (
                      <div className="mt-1">
                        <CopyButton value={message.content} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 border-l-2 border-[#6B5EF0]/20 pl-4 text-sm text-zinc-400 dark:border-[#6B5EF0]/25">
                <span className="flex items-center gap-1">
                  Thinking
                  <span className="flex gap-0.5">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-[#6B5EF0]/60 [animation-delay:-0.3s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-[#6B5EF0]/60 [animation-delay:-0.15s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-[#6B5EF0]/60" />
                  </span>
                </span>
                <span className="font-mono text-[12px] tabular-nums text-zinc-400">
                  {formatElapsed(thinkingSeconds)}
                </span>
              </div>
            )}

            <div ref={bottomRef} />
          </section>
        )}

        {error && (
          <div className="fixed bottom-32 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-600 shadow-lg dark:border-red-900/50 dark:bg-[#17181C] dark:text-red-400">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} className="shrink-0">
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#FAFAF8] via-[#FAFAF8] to-transparent pb-4 pt-10 dark:from-[#101114] dark:via-[#101114]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <form
            onSubmit={sendMessage}
            className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_12px_32px_-12px_rgba(15,15,25,0.12)] transition focus-within:border-[#6B5EF0]/50 focus-within:shadow-[0_12px_32px_-12px_rgba(107,94,240,0.25)] dark:border-white/10 dark:bg-[#17181C] dark:focus-within:border-[#6B5EF0]/50"
          >
            {repository && (
              <div className="mb-1 flex items-center gap-2 px-2 pt-1 font-mono text-[11.5px] text-zinc-400">
                <Icon name="folder" size={12} />
                <span className="truncate">{repository.name}</span>
                <button
                  type="button"
                  onClick={() => setRepository(null)}
                  className="ml-auto rounded px-1 hover:bg-zinc-100 dark:hover:bg-white/5"
                  title="Remove repository"
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={repository ? "Ask about your repository…" : "Upload a repository to get started…"}
              disabled={!repository}
              className="max-h-[180px] min-h-[48px] w-full resize-none bg-transparent px-2 py-3 text-[15px] leading-6 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
            />

            <div className="flex items-center justify-between px-1 pb-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title="Upload repository"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/5 dark:hover:text-zinc-200"
                >
                  <Icon name="paperclip" size={18} />
                </button>

                {!repository && (
                  <span className="hidden font-mono text-[11.5px] text-zinc-400 sm:block">
                    upload a .zip to begin
                  </span>
                )}

                {sending && (
                  <span className="hidden font-mono text-[11.5px] tabular-nums text-zinc-400 sm:block">
                    thinking · {formatElapsed(thinkingSeconds)}
                  </span>
                )}
              </div>

              {sending ? (
                <button
                  type="button"
                  onClick={stopGenerating}
                  title="Stop generating"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <Icon name="square" size={14} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  title="Send message"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#6B5EF0] text-white transition hover:bg-[#5B4FE0] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-white/10 dark:disabled:text-zinc-600"
                >
                  <Icon name="arrowUp" size={17} />
                </button>
              )}
            </div>
          </form>

          <p className="mt-2.5 text-center font-mono text-[10.5px] text-zinc-400 dark:text-zinc-600">
            RepoPilot can make mistakes — verify important code changes before applying them.
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(event) => {
          uploadRepository(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}