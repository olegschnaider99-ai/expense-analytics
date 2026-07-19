"use client";

import { useActionState } from "react";
import { connectMonobank, type ConnectFormState } from "./actions";

const initialState: ConnectFormState = { error: null };

export default function ConnectPage() {
  const [state, formAction, pending] = useActionState(
    connectMonobank,
    initialState,
  );

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-xl font-medium">Підключи свій Monobank</h1>
      <p className="text-sm text-gray-600">
        Створи особистий токен у застосунку Monobank: Ще → Налаштування → API
        для розробників, і встав його нижче.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Особистий токен
          <input
            type="password"
            name="token"
            required
            autoComplete="off"
            className="rounded border px-3 py-2"
          />
        </label>

        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? "Підключаємо…" : "Підключити"}
        </button>
      </form>
    </div>
  );
}
