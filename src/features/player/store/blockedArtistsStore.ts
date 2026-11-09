import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Track } from "@/shared/types";
import { debouncedStorage } from "@/shared/utils/storage";

export interface BlockedArtist {
  id?: string;
  name: string;
}

export interface BlockedArtistsState {
  artists: BlockedArtist[];
  blockArtist: (artist: BlockedArtist) => void;
  unblockArtist: (artist: BlockedArtist) => void;
}

const BLOCKED_ARTISTS_STORAGE_KEY = "liner_blocked_artists";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function usableId(id: string | undefined): string | undefined {
  return id && id !== "unknown" ? id : undefined;
}

export function isSameArtist(a: BlockedArtist, b: BlockedArtist): boolean {
  const aId = usableId(a.id);
  const bId = usableId(b.id);
  if (aId && bId) return aId === bId;
  return normalizeName(a.name) === normalizeName(b.name);
}

/** the artists credited on a track, from its artist list or the joined "a, b" string */
export function getTrackArtists(
  track: Pick<Track, "artists" | "artistId" | "artistList">,
): BlockedArtist[] {
  const list = (track.artistList ?? [])
    .map((artist) => ({
      id: usableId(artist.id),
      name: artist.name?.trim() ?? "",
    }))
    .filter((artist) => artist.name);
  if (list.length > 0) return list;

  return (track.artists ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, index) => ({
      id: index === 0 ? usableId(track.artistId) : undefined,
      name,
    }));
}

// matches by id when both sides have one, by name otherwise (tracks without ids
// only carry the "a, b" string)
export function isTrackBlocked(
  track: Pick<Track, "artists" | "artistId" | "artistList">,
  blocked: BlockedArtist[] = useBlockedArtistsStore.getState().artists,
): boolean {
  if (blocked.length === 0) return false;
  return getTrackArtists(track).some((artist) =>
    blocked.some((it) => isSameArtist(it, artist)),
  );
}

export const useBlockedArtistsStore = create<BlockedArtistsState>()(
  persist(
    (set) => ({
      artists: [],
      blockArtist: (artist) =>
        set((state) => {
          if (state.artists.some((it) => isSameArtist(it, artist)))
            return state;
          return {
            artists: [
              ...state.artists,
              { id: usableId(artist.id), name: artist.name.trim() },
            ],
          };
        }),
      unblockArtist: (artist) =>
        set((state) => ({
          artists: state.artists.filter((it) => !isSameArtist(it, artist)),
        })),
    }),
    {
      name: BLOCKED_ARTISTS_STORAGE_KEY,
      storage: createJSONStorage(() => debouncedStorage),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.artists)) state.artists = [];
      },
      partialize: (state) => ({ artists: state.artists }),
    },
  ),
);
