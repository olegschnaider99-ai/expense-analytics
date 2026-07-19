export function JarList({
  jars,
}: {
  jars: { id: string; currency: string }[];
}) {
  if (jars.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium uppercase text-gray-500">
        Інші рахунки
      </span>
      {jars.map((jar) => (
        <div
          key={jar.id}
          className="flex items-center justify-between rounded border border-dashed px-3 py-1.5 text-gray-500"
        >
          <span>Рахунок у {jar.currency}</span>
          <span
            className="text-xs"
            title="У цій версії синхронізується лише рахунок в основній валюті"
          >
            поки не підтримується
          </span>
        </div>
      ))}
    </div>
  );
}
