"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";

type ImageRow = {
  id?: string | number | null;
  url?: string;
  image_description?: string | null;
  [key: string]: unknown;
};

type ViewMode = "grid" | "list";

const PAGE_SIZE = 12;

const CARD_COLORS = [
  "bg-[#FADADD]",
  "bg-[#CDEAF7]",
  "bg-[#D8F5E1]",
  "bg-[#E6D7FF]",
  "bg-[#FFE5CC]",
  "bg-[#FFF3B0]",
  "bg-[#F7D6E0]",
  "bg-[#D7F0FF]",
  "bg-[#E0F7E9]",
  "bg-[#EFE0FF]",
  "bg-[#FFE9D6]",
  "bg-[#FFF7C2]",
];

const SKELETON_COUNT = 8;

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export default function CrackdPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedRow, setSelectedRow] = useState<ImageRow | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const closeModal = () => setSelectedRow(null);

  useEffect(() => {
    let isMounted = true;

    const fetchImages = async () => {
      setLoading(true);
      setError(null);
      const { data, error: supabaseError, count } = await supabase
        .from("images")
        .select("*", { count: "exact" })
        .not("url", "is", null)
        .neq("url", "")
        .ilike("url", "http%")
        .range(0, PAGE_SIZE - 1);

      if (!isMounted) return;

      if (supabaseError) {
        setError(supabaseError.message);
        setRows([]);
        setTotalCount(null);
      } else {
        setRows((data ?? []) as ImageRow[]);
        setTotalCount(typeof count === "number" ? count : null);
      }
      setLoading(false);
    };

    void fetchImages();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!selectedRow) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedRow(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [selectedRow]);

  const rowsByKey = useMemo(
    () =>
      rows.map((row, index) => ({
        key: String(row.id ?? index),
        row,
        index,
      })),
    [rows]
  );

  const visibleRowsByKey = useMemo(() => rowsByKey.filter(({ key }) => !imageErrors[key]), [rowsByKey, imageErrors]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return visibleRowsByKey;
    return visibleRowsByKey.filter(({ row }) => {
      const description = typeof row.image_description === "string" ? row.image_description : "";
      return description.toLowerCase().includes(query);
    });
  }, [visibleRowsByKey, searchTerm]);

  const hasMore = typeof totalCount === "number" ? rows.length < totalCount : false;

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    const from = rows.length;
    const to = rows.length + PAGE_SIZE - 1;
    const { data, error: supabaseError } = await supabase
      .from("images")
      .select("*")
      .not("url", "is", null)
      .neq("url", "")
      .ilike("url", "http%")
      .range(from, to);

    if (supabaseError) {
      setError(supabaseError.message);
    } else {
      setRows((prev) => [...prev, ...((data ?? []) as ImageRow[])]);
    }
    setLoadingMore(false);
  };

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>;
  }

  if (!loading && rows.length === 0) {
    return <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 text-sm text-zinc-700">No rows found.</div>;
  }

  return (
    <section className="page-enter flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Crackd</h1>
          <p className="text-sm text-zinc-700">A visual gallery of images fetched from Supabase.</p>
        </div>

        <div className="ui-surface-strong flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
            <input
              type="text"
              placeholder="Search descriptions..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 w-full rounded-full border border-zinc-300 bg-white/90 px-4 text-sm text-zinc-800 shadow-sm transition focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 md:max-w-sm"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`ui-button h-10 rounded-full px-4 text-sm font-semibold ${
                  viewMode === "grid" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                Grid view
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`ui-button h-10 rounded-full px-4 text-sm font-semibold ${
                  viewMode === "list" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                List view
              </button>
            </div>
          </div>
          <div className="text-sm text-zinc-600">Showing {filteredRows.length} of {visibleRowsByKey.length}</div>
        </div>
      </div>

      {loading ? (
        <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 2xl:columns-4">
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <article key={`skeleton-${index}`} className="mb-5 break-inside-avoid rounded-2xl border border-white/70 bg-white/55 p-3 shadow-sm">
              <div className="ui-skeleton h-40 w-full rounded-xl" />
              <div className="mt-3 space-y-2">
                <div className="ui-skeleton h-3 w-full rounded" />
                <div className="ui-skeleton h-3 w-4/5 rounded" />
              </div>
            </article>
          ))}
        </div>
      ) : viewMode === "grid" ? (
        <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 2xl:columns-4">
          {filteredRows.map(({ key, row, index }) => {
            const url = typeof row.url === "string" ? row.url : "";
            const description = typeof row.image_description === "string" ? row.image_description : "";
            const colorClass = CARD_COLORS[index % CARD_COLORS.length];
            const visualHeight = index % 3 === 0 ? "h-52" : index % 3 === 1 ? "h-40" : "h-44";

            return (
              <article
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRow(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedRow(row);
                  }
                }}
                className={`ui-card group mb-5 break-inside-avoid overflow-hidden rounded-2xl border border-white/70 shadow-sm focus:outline-none ${colorClass}`}
              >
                <div className={`relative flex items-center justify-center ${visualHeight}`}>
                  <img
                    src={url}
                    alt={description || "Crackd image"}
                    className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]`}
                    onError={() => setImageErrors((prev) => ({ ...prev, [key]: true }))}
                  />
                </div>
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex-1">
                    {description ? (
                      <p
                        className="text-sm text-zinc-800"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {description}
                      </p>
                    ) : (
                      <p className="text-sm italic text-zinc-600">No description provided.</p>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">Row {index + 1}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredRows.map(({ key, row, index }) => {
            const url = typeof row.url === "string" ? row.url : "";
            const description = typeof row.image_description === "string" ? row.image_description : "";
            const colorClass = CARD_COLORS[index % CARD_COLORS.length];

            return (
              <article
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRow(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedRow(row);
                  }
                }}
                className={`ui-card group flex overflow-hidden rounded-2xl border border-white/70 shadow-sm focus:outline-none ${colorClass}`}
              >
                <div className="relative h-28 w-28 flex-shrink-0 md:h-32 md:w-40">
                  <img
                    src={url}
                    alt={description || "Crackd image"}
                    className="h-full w-full object-cover"
                    onError={() => setImageErrors((prev) => ({ ...prev, [key]: true }))}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex-1">
                    {description ? (
                      <p
                        className="text-sm text-zinc-800"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {description}
                      </p>
                    ) : (
                      <p className="text-sm italic text-zinc-600">No description provided.</p>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">Row {index + 1}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex justify-center">
        {hasMore ? (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="ui-button h-11 rounded-full bg-zinc-900 px-6 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {loadingMore ? "Loading more..." : "Load more"}
          </button>
        ) : (
          <span className="text-sm text-zinc-500">No more items to load.</span>
        )}
      </div>

      {selectedRow ? (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button className="absolute inset-0 bg-black/40" onClick={closeModal} />
            <div className="relative w-[min(980px,94vw)] max-h-[92vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
              <div className="flex items-center justify-between border-b border-zinc-200 bg-white/90 px-6 py-4">
                <h2 className="font-semibold">Crackd image</h2>
                <button onClick={closeModal} className="h-10 w-10 rounded-full border border-zinc-200">
                  ×
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                <div className="w-full max-h-[65vh] rounded-2xl bg-zinc-50 flex items-center justify-center">
                  <img
                    src={selectedRow.url}
                    alt={selectedRow.image_description ?? "Crackd image"}
                    className="block max-h-[65vh] w-full object-contain"
                  />
                </div>

                <p className="mt-4 text-sm text-zinc-800 whitespace-pre-wrap break-words">
                  {selectedRow.image_description?.trim() ? selectedRow.image_description : "No description provided."}
                </p>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </section>
  );
}
