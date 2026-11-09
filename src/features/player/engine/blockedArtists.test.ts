import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playerEngine, usePlayerStore } from "./playerEngine";
import {
  isTrackBlocked,
  useBlockedArtistsStore,
} from "../store/blockedArtistsStore";
import { api } from "@/shared/api";
import type { Track } from "@/shared/types";

const mk = (id: string, artist = `Artist ${id}`): Track => ({
  id,
  title: `Track ${id}`,
  artists: artist,
  durationMs: 180000,
  coverUrl: "",
  playCount: 0,
});

const ids = () => usePlayerStore.getState().queue.map((t) => t.id);

describe("isTrackBlocked", () => {
  it("matches by id when both sides have one", () => {
    const track = {
      artists: "Same Name",
      artistList: [{ id: "a2", name: "Same Name" }],
    };
    expect(isTrackBlocked(track, [{ id: "a1", name: "Same Name" }])).toBe(
      false,
    );
    expect(isTrackBlocked(track, [{ id: "a2", name: "Other" }])).toBe(true);
  });

  it("falls back to the name, case-insensitive, for any credited artist", () => {
    expect(
      isTrackBlocked({ artists: "Main, Feat Guest" }, [{ name: "feat guest" }]),
    ).toBe(true);
    expect(isTrackBlocked({ artists: "Main" }, [{ name: "Mainstream" }])).toBe(
      false,
    );
  });
});

describe("blocked artists in the player", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useBlockedArtistsStore.setState({ artists: [] });
    usePlayerStore.setState({
      status: "idle",
      queue: [],
      currentIndex: -1,
      currentTrack: null,
      positionMs: 0,
      durationMs: 0,
      repeat: "off",
      shuffle: false,
      error: null,
      autoplaySimilar: false,
      playbackContext: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("leaves a blocked artist's tracks out of a played list", async () => {
    useBlockedArtistsStore.getState().blockArtist({ name: "Bad" });
    const list = [mk("a"), mk("b", "Bad"), mk("c")];
    await playerEngine.playTrack(list[0], list);
    expect(ids()).toEqual(["a", "c"]);
  });

  it("starts from the next playable track when a blocked one is picked", async () => {
    useBlockedArtistsStore.getState().blockArtist({ name: "Bad" });
    const list = [mk("a", "Bad"), mk("b", "Bad"), mk("c")];
    await playerEngine.playTrack(list[0], list);
    expect(usePlayerStore.getState().currentTrack?.id).toBe("c");
    expect(ids()).toEqual(["c"]);
  });

  it("does not queue a blocked artist's track", async () => {
    await playerEngine.playTrack(mk("a"), [mk("a")]);
    useBlockedArtistsStore.getState().blockArtist({ name: "Bad" });
    playerEngine.addToQueue(mk("b", "Bad"));
    playerEngine.playNext(mk("c", "Bad"));
    expect(ids()).toEqual(["a"]);
  });

  it("blocking prunes the queue and skips the playing track", async () => {
    const list = [mk("a"), mk("b", "Bad"), mk("c", "Bad"), mk("d")];
    await playerEngine.playTrack(list[1], list);
    usePlayerStore.getState().setStatus("playing");

    useBlockedArtistsStore.getState().blockArtist({ name: "Bad" });
    await vi.advanceTimersByTimeAsync(0);

    const state = usePlayerStore.getState();
    expect(ids()).toEqual(["a", "d"]);
    expect(state.currentTrack?.id).toBe("d");
    expect(state.currentIndex).toBe(1);
  });

  it("blocking while paused moves to the next track without playing it", async () => {
    const list = [mk("a", "Bad"), mk("b")];
    await playerEngine.playTrack(list[0], list);
    usePlayerStore.getState().setStatus("paused");

    useBlockedArtistsStore.getState().blockArtist({ name: "Bad" });

    const state = usePlayerStore.getState();
    expect(ids()).toEqual(["b"]);
    expect(state.currentTrack?.id).toBe("b");
    expect(state.status).toBe("paused");
  });

  it("drops blocked artists from radio refills", async () => {
    useBlockedArtistsStore.getState().blockArtist({ name: "Bad" });
    vi.spyOn(api, "getRadio").mockResolvedValue({
      items: [
        { id: "b", title: "Track b", artists: "Bad", durationMs: 1 },
        { id: "c", title: "Track c", artists: "Good", durationMs: 1 },
      ],
    } as any);
    await playerEngine.startRadioStation(mk("a"));
    expect(ids()).toEqual(["a", "c"]);
  });
});
