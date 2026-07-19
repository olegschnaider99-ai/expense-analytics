import { signOut } from "@/lib/supabase/actions";

export function Sidebar() {
  return (
    <nav className="hidden w-16 flex-col items-center gap-2 border-r border-gray-100 bg-white py-6 md:flex dark:border-zinc-800 dark:bg-zinc-950">
      <div
        className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white dark:bg-white dark:text-black"
        title="Дашборд"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="7" height="9" rx="1.5" fill="currentColor" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" fill="currentColor" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" fill="currentColor" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" fill="currentColor" />
        </svg>
      </div>

      <a
        href="#ai-panel"
        title="AI-асистент"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2l1.8 5.6L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.4L12 2z"
            fill="currentColor"
          />
        </svg>
      </a>

      <form action={signOut} className="mt-auto">
        <button
          type="submit"
          title="Вийти"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </nav>
  );
}
