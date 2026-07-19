"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const EXAMPLE_QUESTIONS = [
  "На що я найбільше витратив(-ла) минулого тижня?",
  "Як цей місяць порівнюється з минулим?",
  "Чи були нещодавно якісь незвичні покупки?",
];

export function AiPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

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
    <aside className="flex h-full w-full flex-col border-l bg-gray-50 md:max-w-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-medium">Запитай про свої витрати</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">Спробуй запитати:</p>
            {EXAMPLE_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => ask(question)}
                className="rounded border bg-white px-3 py-2 text-left text-sm hover:bg-gray-100"
              >
                {question}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user"
                    ? "self-end rounded bg-black px-3 py-2 text-sm text-white"
                    : "self-start rounded bg-white px-3 py-2 text-sm shadow-sm"
                }
              >
                {message.content}
              </div>
            ))}
            {pending ? (
              <div
                role="status"
                aria-label="Thinking"
                className="self-start rounded bg-white px-3 py-2 text-sm text-gray-400 shadow-sm"
              >
                Думаю…
              </div>
            ) : null}
          </div>
        )}
      </div>

      {quotaExceeded ? (
        <div className="border-t bg-amber-50 p-3 text-sm text-amber-900">
          Ти використав(-ла) сьогоднішні безкоштовні запитання.
          <button
            type="button"
            disabled
            title="Скоро"
            className="mt-2 block w-full rounded bg-black px-3 py-2 text-center text-sm text-white opacity-50"
          >
            Перейти на преміум — скоро
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
          className="flex gap-2 border-t p-3"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={pending}
            placeholder="Постав запитання…"
            className="flex-1 rounded border px-3 py-2 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Надіслати
          </button>
        </form>
      )}
    </aside>
  );
}
