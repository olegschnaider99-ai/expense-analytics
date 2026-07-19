"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "./actions";
import type { AuthFormState } from "../register/actions";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

const initialState: AuthFormState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium">Увійти</h1>

      <GoogleSignInButton />

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="h-px flex-1 bg-gray-200" />
        або
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Пароль
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
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
          {pending ? "Входимо…" : "Увійти"}
        </button>

        <p className="text-sm text-gray-600">
          Ще немає акаунта?{" "}
          <Link href="/register" className="underline">
            Зареєструватися
          </Link>
        </p>
      </form>
    </div>
  );
}
