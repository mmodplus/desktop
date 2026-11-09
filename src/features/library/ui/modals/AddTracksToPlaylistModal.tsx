import { useState } from "react";
import {
  Search2Line,
  CloseCircleFill,
  AddLine,
  CheckLine,
  MusicLine,
} from "@mingcute/react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/shared/ui";
import { ApiError } from "@/shared/api";
import TextInput from "@/shared/ui/TextInput";
import Dialog from "@/shared/ui/Dialog";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useSearchTracks } from "@/features/search/hooks/useSearchTracks";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types";
import { useAddPlaylistTracks } from "../../hooks";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

function formatDuration(ms: number) {
  return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
}

interface AddTracksToPlaylistModalProps {
  open: boolean;
  onClose: () => void;
  playlistId: string;
  /** tracks already in the playlist, shown as added */
  existingTrackIds: ReadonlySet<string>;
}

// Search the catalogue and add songs to a playlist without leaving it.
// Stays open after each add so several songs can go in one go.
export default function AddTracksToPlaylistModal({
  open,
  onClose,
  playlistId,
  existingTrackIds,
}: AddTracksToPlaylistModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      maxWidth={440}
    >
      {/* mounted only while open, so the query starts empty every time */}
      <AddTracksContent
        playlistId={playlistId}
        existingTrackIds={existingTrackIds}
      />
    </Dialog>
  );
}

function AddTracksContent({
  playlistId,
  existingTrackIds,
}: Pick<AddTracksToPlaylistModalProps, "playlistId" | "existingTrackIds">) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  // added during this session; the playlist refetch catches up on its own
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const addTrack = useAddPlaylistTracks();
  const { tracks, loading, hasLoaded, error } = useSearchTracks(query);

  const isSearching = query.trim().length >= 2;
  const isInPlaylist = (id: string) =>
    added.has(id) || existingTrackIds.has(id);

  const handleAdd = async (track: Track) => {
    if (adding.has(track.id) || isInPlaylist(track.id)) return;
    setAdding((prev) => new Set(prev).add(track.id));
    try {
      await addTrack.mutateAsync({ playlistId, trackId: track.id });
      setAdded((prev) => new Set(prev).add(track.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setAdded((prev) => new Set(prev).add(track.id));
        toast(t("common.track_already_in_playlist"), "error", {
          description: track.title || undefined,
        });
      } else {
        toast(t("common.failed_add_playlist"), "error", {
          description: track.title || undefined,
        });
      }
    } finally {
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col gap-[12px] px-[12px] pb-[12px]">
      <div className="flex flex-col gap-[10px] px-[8px] pt-[4px]">
        <h2
          className="m-0 text-[18px] font-[600] tracking-[-0.01em] text-text-primary"
          style={font}
        >
          {t("playlist.add_songs")}
        </h2>
        <TextInput
          size="sm"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("playlist.add_songs_placeholder")}
          spellCheck={false}
          autoComplete="off"
          icon={<Search2Line size={16} />}
          rightSlot={
            query ? (
              <button
                type="button"
                aria-label={t("track_search.clear")}
                onClick={() => setQuery("")}
                className="border-none bg-transparent p-0 text-text-tertiary hover:text-text-primary cursor-pointer flex items-center justify-center"
              >
                <CloseCircleFill size={15} />
              </button>
            ) : null
          }
          className="!h-[36px] w-full rounded-md !border-transparent bg-bg-elevated text-[13px]"
        />
      </div>

      <div className="flex flex-col gap-[2px] h-[min(360px,55vh)] overflow-y-auto">
        {!isSearching ? (
          <EmptyState
            icon={<Search2Line size={18} />}
            text={t("playlist.add_songs_hint")}
          />
        ) : loading && !hasLoaded ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="h-[18px] w-[18px] animate-spin rounded-full border-[2px] border-text-tertiary border-t-text-primary" />
          </div>
        ) : error || tracks.length === 0 ? (
          <EmptyState
            icon={<MusicLine size={18} />}
            text={
              error
                ? t("common.no_results")
                : `${t("common.no_results")}. ${t("common.try_another_search")}`
            }
          />
        ) : (
          tracks.map((track) => {
            const inPlaylist = isInPlaylist(track.id);
            const isAdding = adding.has(track.id);
            return (
              <button
                key={track.id}
                type="button"
                disabled={inPlaylist || isAdding}
                onClick={() => void handleAdd(track)}
                className={`flex items-center gap-[12px] p-[8px] rounded-md transition-[background-color,opacity] text-left group w-full border-none bg-transparent ${
                  inPlaylist
                    ? "cursor-default"
                    : "cursor-pointer hover:bg-bg-elevated active:bg-border-alpha-14"
                } ${loading ? "opacity-60" : ""}`}
              >
                <div className="relative h-[44px] w-[44px] rounded-lg bg-bg-elevated overflow-hidden shrink-0 flex items-center justify-center">
                  {track.coverUrl ? (
                    <CoverImage
                      src={track.coverUrl}
                      alt={track.title}
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  ) : (
                    <MusicLine size={20} className="text-text-tertiary" />
                  )}
                </div>

                <div className="flex flex-col gap-[1px] min-w-0 flex-1">
                  <span
                    className="text-[13px] font-[500] text-text-primary truncate"
                    style={font}
                  >
                    {track.title}
                  </span>
                  <span
                    className="text-[12px] text-text-tertiary truncate"
                    style={font}
                  >
                    {track.artists}
                  </span>
                </div>

                {track.durationMs > 0 && (
                  <span
                    className="shrink-0 text-[12px] text-text-tertiary tabular-nums"
                    style={font}
                  >
                    {formatDuration(track.durationMs)}
                  </span>
                )}

                {isAdding ? (
                  <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center">
                    <span className="h-[14px] w-[14px] animate-spin rounded-full border-[2px] border-text-tertiary border-t-text-primary" />
                  </span>
                ) : (
                  <span
                    title={inPlaylist ? t("playlist.in_playlist") : undefined}
                    className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full transition-colors ${
                      inPlaylist
                        ? "text-emerald-400"
                        : "text-text-tertiary group-hover:bg-border-alpha-14 group-hover:text-text-primary"
                    }`}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={inPlaylist ? "check" : "add"}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.08 }}
                        className="flex items-center justify-center"
                      >
                        {inPlaylist ? (
                          <CheckLine size={18} />
                        ) : (
                          <AddLine size={18} />
                        )}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="mx-[8px] flex flex-1 flex-col items-center justify-center gap-[8px] rounded-md bg-bg-elevated/60 px-[12px] py-[24px] text-center">
      <span className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-bg-elevated text-text-tertiary">
        {icon}
      </span>
      <p className="m-0 text-[13px] text-text-secondary" style={font}>
        {text}
      </p>
    </div>
  );
}
