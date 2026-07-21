"use client";

import { useEffect, useRef, useState } from "react";
import { activatePremium } from "@/app/dashboard/premium/actions";

type Message = { role: "user" | "assistant"; content: string };

const EXAMPLE_QUESTIONS = [
  "На що я найбільше витратив(-ла) минулого тижня?",
  "Як цей місяць порівнюється з минулим?",
  "Чи були нещодавно якісь незвичні покупки?",
];

/** Renders **bold** spans and preserves line breaks; the model's answers
 * are plain text with light markdown, not full markdown documents. */
function renderContent(content: string) {
  return content.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function Avatar({ role }: { role: Message["role"] }) {
  return (
    <div
      className={
        role === "assistant"
          ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 text-sm"
          : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm dark:bg-zinc-700"
      }
    >
      {role === "assistant" ? "✨" : "🙂"}
    </div>
  );
}

export function AiPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [activatingPremium, setActivatingPremium] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function handleActivatePremium() {
    setActivatingPremium(true);
    try {
      const result = await activatePremium();
      if (result.ok) {
        // Full reload so the header badge and the AI quota check (both
        // server-derived) pick up the new premium status too.
        window.location.reload();
      }
    } finally {
      setActivatingPremium(false);
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  async function ask(question: string) {
    if (!question.trim() || pending || quotaExceeded) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setPending(true);

    try {
      const response = await fetch("/api/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: messages }),
      });
      const data = await response.json();

      if (response.status === 429 && data.error === "quota_exceeded") {
        setQuotaExceeded(true);
        setMessages(nextMessages);
        return;
      }

      const answer =
        response.ok && data.answer
          ? data.answer
          : "Вибач, не вдалося відповісти на це. Спробуй трохи пізніше.";
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
    } catch {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Вибач, не вдалося зв'язатися з асистентом." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-gray-100 bg-white md:max-w-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-zinc-800">
        <span className="text-base">✨</span>
        <h2 className="text-sm font-semibold">Запитай про свої витрати</h2>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">Спробуй запитати:</p>
            {EXAMPLE_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => ask(question)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                {question}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user"
                    ? "flex items-end justify-end gap-2"
                    : "flex items-end gap-2"
                }
              >
                {message.role === "assistant" ? <Avatar role="assistant" /> : null}
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[80%] rounded-2xl rounded-br-sm bg-black px-3 py-2 text-sm whitespace-pre-wrap text-white dark:bg-white dark:text-black"
                      : "max-w-[80%] rounded-2xl rounded-bl-sm border border-gray-100 bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  }
                >
                  {renderContent(message.content)}
                </div>
                {message.role === "user" ? <Avatar role="user" /> : null}
              </div>
            ))}
            {pending ? (
              <div className="flex items-end gap-2">
                <Avatar role="assistant" />
                <div
                  role="status"
                  aria-label="Thinking"
                  className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-gray-100 bg-gray-50 px-3 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {quotaExceeded ? (
        <div className="border-t border-gray-100 bg-amber-50 p-3 text-sm text-amber-900 dark:border-zinc-800 dark:bg-amber-950/40 dark:text-amber-400">
          Ти використав(-ла) сьогоднішні безкоштовні запитання.
          <button
            type="button"
            onClick={handleActivatePremium}
            disabled={activatingPremium}
            className="mt-2 block w-full rounded-xl bg-black px-3 py-2 text-center text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {activatingPremium ? "Активуємо…" : "👑 Активувати Premium (тест)"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
          className="flex gap-2 border-t border-gray-100 p-3 dark:border-zinc-800"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={pending}
            placeholder="Постав запитання…"
            className="flex-1 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:border-gray-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={pending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white disabled:opacity-50 dark:bg-white dark:text-black"
            aria-label="Надіслати"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 12L20 4L13 20L11 13L4 12Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </form>
      )}
    </aside>
  );
}
