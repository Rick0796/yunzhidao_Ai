import type { ModuleMeta } from "../../types";

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

export default function RewriteMetaHint({ meta }: { meta: ModuleMeta | null }) {
  if (!meta?.message) return null;
  return (
    <div
      className={cx(
        "mt-3 rounded-2xl border px-4 py-3 text-xs leading-6",
        meta.source === "api" ? "border-cyan-400/15 bg-cyan-400/8 text-cyan-100" : "border-amber-400/20 bg-amber-400/10 text-amber-100"
      )}
    >
      {meta.message}
    </div>
  );
}
