"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type ImageRow = {
  id?: string | number | null;
  url?: string | null;
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

export default function CrackdPage() {
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedRow, setSelectedRow] = useState<ImageRow | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchImages = async () => {
      setLoading(true);
      setError(null);
      const { data, error: supabaseError, count } = await supabase
        .from("images")
        .select("*", { count: "exact" })
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

    fetchImages();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rowsByKey;
    return rowsByKey.filter(({ row }) => {
      const description =
        typeof row.image_description === "string"
          ? row.image_description
          : "";
      return description.toLowerCase().includes(query);
    });
  }, [rowsByKey, searchTerm]);

  const hasMore =
    typeof totalCount === "number" ? rows.length < totalCount : false;

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    const from = rows.length;
    const to = rows.length + PAGE_SIZE - 1;
    const { data, error: supabaseError } = await supabase
      .from("images")
      .select("*")
      .range(from, to);

    if (supabaseError) {
      setError(supabaseError.message);
    } else {
      setRows((prev) => [...prev, ...((data ?? []) as ImageRow[])]);
    }
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div
        className="text-sm text-zinc-700"
        style={{ fontFamily: '"Times New Roman", Times, serif' }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="text-sm text-red-700"
        style={{ fontFamily: '"Times New Roman", Times, serif' }}
      >
        Error: {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="text-sm text-zinc-700"
        style={{ fontFamily: '"Times New Roman", Times, serif' }}
      >
        No rows found.
      </div>
    );
  }

  return (
    <section
      className="flex flex-col gap-6"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Crackd</h1>
          <p className="text-sm text-zinc-700">
            A gallery of images fetched from Supabase.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200/70 bg-white/80 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
            <input
              type="text"
              placeholder="Search descriptions..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 w-full rounded-full border border-zinc-300 bg-white/90 px-4 text-sm text-zinc-800 shadow-sm focus:border-zinc-400 focus:outline-none md:max-w-sm"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`h-10 rounded-full px-4 text-sm font-semibold transition ${
                  viewMode === "grid"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                Grid view
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`h-10 rounded-full px-4 text-sm font-semibold transition ${
                  viewMode === "list"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                List view
              </button>
            </div>
          </div>
          <div className="text-sm text-zinc-600">
            Showing {filteredRows.length} of{" "}
            {typeof totalCount === "number" ? totalCount : rows.length}
          </div>
        </div>
      </div>

      <div
        className={
          viewMode === "grid"
            ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "flex flex-col gap-4"
        }
      >
        {filteredRows.map(({ key, row, index }) => {
          const url = typeof row.url === "string" ? row.url : "";
          const description =
            typeof row.image_description === "string"
              ? row.image_description
              : "";
          const showImage = url && !imageErrors[key];
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
              className={`group flex w-full overflow-hidden rounded-2xl border border-white/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none ${
                viewMode === "grid" ? "flex-col" : "flex-row"
              } ${colorClass}`}
            >
              <div
                className={`relative flex items-center justify-center ${
                  viewMode === "grid"
                    ? "h-40"
                    : "h-28 w-28 flex-shrink-0 md:h-32 md:w-40"
                }`}
              >
                {showImage ? (
                  <img
                    src={url}
                    alt={description || "Crackd image"}
                    className={`w-full object-cover ${
                      viewMode === "grid" ? "h-40" : "h-28 md:h-32"
                    }`}
                    onError={() =>
                      setImageErrors((prev) => ({ ...prev, [key]: true }))
                    }
                  />
                ) : (
                  <div className="text-sm text-zinc-600">Image unavailable</div>
                )}
              </div>
              <div
                className={`flex flex-1 ${
                  viewMode === "grid"
                    ? "flex-col gap-3 p-4"
                    : "flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                }`}
              >
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
                    <p className="text-sm italic text-zinc-600">
                      No description provided.
                    </p>
                  )}
                </div>
                <span className="text-xs text-zinc-500">
                  Row {index + 1}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex justify-center">
        {hasMore ? (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {loadingMore ? "Loading more..." : "Load more"}
          </button>
        ) : (
          <span className="text-sm text-zinc-500">No more items to load.</span>
        )}
      </div>

      {selectedRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            aria-label="Close modal"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelectedRow(null)}
          />
          <div className="relative z-10 flex w-[min(900px,92vw)] max-h-[88vh] flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200/70 bg-white/95 px-6 py-4 backdrop-blur">
              <h2 className="text-base font-semibold text-zinc-900">
                Crackd image
              </h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setSelectedRow(null)}
                className="h-9 w-9 rounded-full border border-zinc-200 bg-white text-lg text-zinc-600 transition hover:bg-zinc-100"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-col gap-4">
                <div className="overflow-hidden rounded-2xl bg-zinc-100">
                  {selectedRow.url ? (
                    <img
                      src={String(selectedRow.url)}
                      alt={
                        typeof selectedRow.image_description === "string"
                          ? selectedRow.image_description
                          : "Crackd image"
                      }
                      className="w-full max-h-[55vh] object-contain"
                    />
                  ) : (
                    <div className="flex h-48 items-center justify-center text-sm text-zinc-600">
                      Image unavailable
                    </div>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">
                  {typeof selectedRow.image_description === "string" &&
                  selectedRow.image_description.trim()
                    ? selectedRow.image_description
                    : "No description provided."}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
