export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-gradient-to-b from-zinc-50 to-white px-4 py-16 dark:from-black dark:to-zinc-900">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <svg
            width="44"
            height="44"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="40" height="40" rx="11" fill="url(#logo-gradient)" />
            <path
              d="M11 27V19M20 27V13M29 27V22"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient
                id="logo-gradient"
                x1="0"
                y1="0"
                x2="40"
                y2="40"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#22d3ee" />
                <stop offset="1" stopColor="#6366f1" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">
            Аналітика витрат
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
