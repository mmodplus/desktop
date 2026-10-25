import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "@/languages";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SkipNext, SkipPrevious } from "@solar-icons/react";
import {
  PlayerMorphIcon,
  ICON_PLAY,
  ICON_PAUSE,
} from "@/features/player/ui/morphPlayerIcons";
import { HeartFill, HeartLine } from "@mingcute/react";
import CoverImage from "@/features/covers/ui/CoverImage";
import { ScrollableText } from "@/shared/ui/ScrollableText";
import { useDisableButtonFocus } from "@/features/navigation/hooks/useDisableButtonFocus";
import { getAuthSession } from "@/shared/api/auth-session";
import type { OverlayAction, OverlayStatePayload } from "../contracts";
import {
  useCustomizationStore,
  loadPersistedWallpaper,
  DEFAULT_GLASS_CONFIG,
} from "@/features/settings/store/customizationStore";
import { useShortcutsStore, matchesShortcut } from "@/features/shortcuts";
import {
  useOverlaySettingsStore,
  OVERLAY_SETTINGS_STORAGE_KEY,
} from "../store/overlaySettingsStore";

const OVERLAY_CARD_TRANSITION = {
  duration: 0.08,
  ease: [0.16, 1, 0.3, 1],
} as const;
// entrance only: the window hides 90ms after "visibility false", so the exit stays short
const OVERLAY_CARD_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 30,
  mass: 0.7,
} as const;
const TRACK_SWAP_TRANSITION = {
  duration: 0.32,
  ease: [0.16, 1, 0.3, 1],
} as const;
const LIKE_ACCENT = "#ff3b5c";
const LIKE_BURST_ANGLES = [-90, -30, 30, 90, 150, 210];

function LikeIcon({
  isLiked,
  pulseKey,
  animated,
}: {
  isLiked: boolean;
  // bumps on every like / unlike of the same track; track changes don't animate
  pulseKey: number;
  animated: boolean;
}) {
  const pulsed = animated && pulseKey > 0;
  return (
    <span className="relative flex h-[16px] w-[16px] items-center justify-center">
      {pulsed && isLiked && (
        <span key={pulseKey} className="pointer-events-none absolute inset-0">
          <motion.span
            className="absolute left-1/2 top-1/2 -ml-[9px] -mt-[9px] h-[18px] w-[18px] rounded-full border-[1.5px]"
            style={{ borderColor: LIKE_ACCENT }}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
          {LIKE_BURST_ANGLES.map((angle) => {
            const rad = (angle * Math.PI) / 180;
            return (
              <motion.span
                key={angle}
                className="absolute left-1/2 top-1/2 -ml-[1.5px] -mt-[1.5px] h-[3px] w-[3px] rounded-full"
                style={{ backgroundColor: LIKE_ACCENT }}
                initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                animate={{
                  x: Math.cos(rad) * 13,
                  y: Math.sin(rad) * 13,
                  scale: 0,
                  opacity: 0,
                }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            );
          })}
        </span>
      )}
      <motion.span
        key={pulseKey}
        className="relative flex"
        initial={pulsed ? { scale: isLiked ? 0.3 : 0.7 } : false}
        animate={{ scale: 1 }}
        transition={
          isLiked
            ? { type: "spring", stiffness: 600, damping: 11 }
            : { type: "spring", stiffness: 500, damping: 24 }
        }
      >
        {isLiked ? <HeartFill size={16} /> : <HeartLine size={16} />}
      </motion.span>
    </span>
  );
}

export function OverlayPlayer() {
  useDisableButtonFocus();
  const { t } = useTranslation();

  const [state, setState] = useState<OverlayStatePayload>({
    status: "idle",
    track: null,
    positionMs: 0,
    durationMs: 0,
    volume: 1,
    isLiked: false,
  });

  const [isInfoHovered, setIsInfoHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const animationsEnabled = useOverlaySettingsStore((s) => s.animations);
  const prefersReducedMotion = useReducedMotion();
  const animated = animationsEnabled && !prefersReducedMotion;

  // the toggle lives in the main window: pick it up when it writes the shared storage
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === OVERLAY_SETTINGS_STORAGE_KEY) {
        void useOverlaySettingsStore.persist.rehydrate();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const [likePulseKey, setLikePulseKey] = useState(0);
  const likeTrackRef = useRef<{ id: string | null; isLiked: boolean }>({
    id: null,
    isLiked: false,
  });

  const anchorPosRef = useRef(state.positionMs);
  const anchorTimeRef = useRef(performance.now());
  const [interpolatedPosMs, setInterpolatedPosMs] = useState(state.positionMs);
  const lastTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!getAuthSession()) {
      window.linerElectron?.closeOverlay?.();
      return;
    }

    window.linerElectron?.getOverlayInitialState?.().then((initial) => {
      if (initial) {
        anchorPosRef.current = initial.positionMs;
        anchorTimeRef.current = performance.now();
        setInterpolatedPosMs(initial.positionMs);
        setState(initial);
      }
    });

    if (window.linerElectron?.onOverlayState) {
      const cleanupState = window.linerElectron.onOverlayState((newState) => {
        setState(newState);
      });
      return cleanupState;
    }
  }, []);

  useEffect(() => {
    const signal = setTimeout(() => window.linerElectron?.overlayReady?.(), 0);
    return () => clearTimeout(signal);
  }, []);

  useEffect(() => {
    if (!window.linerElectron?.onOverlayVisibility) return;
    const cleanupVisibility = window.linerElectron.onOverlayVisibility(
      (visible) => {
        setIsVisible(visible);
      },
    );
    return cleanupVisibility;
  }, []);

  const sendAction = useCallback((action: OverlayAction) => {
    window.linerElectron?.sendOverlayAction?.(action);
  }, []);

  useEffect(() => {
    const trackId = state.track?.id ?? null;
    const previous = likeTrackRef.current;
    if (previous.id === trackId && previous.isLiked !== state.isLiked) {
      setLikePulseKey((key) => key + 1);
    }
    likeTrackRef.current = { id: trackId, isLiked: state.isLiked };
  }, [state.track?.id, state.isLiked]);

  const isPlaying = state.status === "playing";
  const isLoading = state.status === "loading" || state.status === "buffering";
  const trackKey = state.track?.id ?? state.track?.title ?? "none";
  const coverSrc = state.track?.coverUrl || state.track?.cover || "";
  const durationMs = Math.max(
    1,
    state.durationMs || state.track?.durationMs || 1,
  );

  useEffect(() => {
    if (state.track?.id !== lastTrackIdRef.current) {
      lastTrackIdRef.current = state.track?.id ?? null;
      setInterpolatedPosMs(state.positionMs);
      anchorPosRef.current = state.positionMs;
      anchorTimeRef.current = performance.now();
      return;
    }

    if (state.status === "paused") {
      const pos = state.positionMs > 0 ? state.positionMs : interpolatedPosMs;
      setInterpolatedPosMs(pos);
      anchorPosRef.current = pos;
      anchorTimeRef.current = performance.now();
      return;
    }

    if (state.positionMs > 0 || interpolatedPosMs === 0) {
      setInterpolatedPosMs(state.positionMs);
      anchorPosRef.current = state.positionMs;
      anchorTimeRef.current = performance.now();
    }
  }, [state.positionMs, state.status, state.track?.id]);

  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;

    const step = () => {
      if (document.hidden) {
        animId = requestAnimationFrame(step);
        return;
      }
      const elapsed = performance.now() - anchorTimeRef.current;
      const current = Math.min(durationMs, anchorPosRef.current + elapsed);
      setInterpolatedPosMs(current);
      animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animId);
      const elapsed = performance.now() - anchorTimeRef.current;
      anchorPosRef.current = Math.min(
        durationMs,
        anchorPosRef.current + elapsed,
      );
      anchorTimeRef.current = performance.now();
    };
  }, [isPlaying, durationMs]);

  const currentPosMs = interpolatedPosMs;
  const progressRatio = Math.min(1, Math.max(0, currentPosMs / durationMs));

  const backgroundImage = useCustomizationStore((s) => s.backgroundImage);
  const backgroundBlur = useCustomizationStore((s) => s.backgroundBlur);
  const backgroundDim = useCustomizationStore((s) => s.backgroundDim);
  const contentViewConfig = useCustomizationStore((s) => s.contentView);
  const miniplayerConfig = useCustomizationStore((s) => s.miniplayer);
  const hasCustomBg = Boolean(backgroundImage);

  const activeBlockConfig =
    (miniplayerConfig && (miniplayerConfig.opacity < 100 || miniplayerConfig.blur > 0 || miniplayerConfig.dim > 0))
      ? miniplayerConfig
      : (contentViewConfig && (contentViewConfig.opacity < 100 || contentViewConfig.blur > 0 || contentViewConfig.dim > 0))
        ? contentViewConfig
        : DEFAULT_GLASS_CONFIG;

  const alpha = Math.min(0.85, (activeBlockConfig?.opacity ?? 70) / 100);
  const dimAlpha = (activeBlockConfig?.dim ?? 15) / 100;
  const blurPx = activeBlockConfig?.blur ?? 24;

  const tintBackground = dimAlpha > 0
    ? `linear-gradient(rgba(0, 0, 0, ${dimAlpha}), rgba(0, 0, 0, ${dimAlpha})), rgba(12, 12, 14, ${alpha})`
    : `rgba(12, 12, 14, ${alpha})`;

  useEffect(() => {
    void loadPersistedWallpaper().then((img) => {
      if (img) {
        useCustomizationStore.setState({ backgroundImage: img });
      }
    });
  }, []);

  // Keyboard Shortcuts (Miniplayer mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const { miniplayer } = useShortcutsStore.getState();

      // Sound up / down shortcuts
      if (matchesShortcut(e, miniplayer.volumeUp)) {
        e.preventDefault();
        sendAction({ type: "volumeUp" });
        return;
      }

      if (matchesShortcut(e, miniplayer.volumeDown)) {
        e.preventDefault();
        sendAction({ type: "volumeDown" });
        return;
      }

      // Switch to main app
      if (matchesShortcut(e, miniplayer.focusMainWindow)) {
        e.preventDefault();
        sendAction({ type: "focusMainWindow" });
        return;
      }

      // Playback toggle
      if (matchesShortcut(e, miniplayer.playPause)) {
        e.preventDefault();
        sendAction({ type: "togglePlay" });
        return;
      }

      // Seek left / right
      if (matchesShortcut(e, miniplayer.seekBackward)) {
        e.preventDefault();
        sendAction({
          type: "seek",
          payload: { positionMs: Math.max(0, currentPosMs - 5000) },
        });
        return;
      }

      if (matchesShortcut(e, miniplayer.seekForward)) {
        e.preventDefault();
        sendAction({
          type: "seek",
          payload: { positionMs: Math.min(durationMs, currentPosMs + 5000) },
        });
        return;
      }

      // Like
      if (matchesShortcut(e, miniplayer.likeTrack)) {
        e.preventDefault();
        sendAction({ type: "like" });
        return;
      }

      // Previous
      if (matchesShortcut(e, miniplayer.prevTrack)) {
        e.preventDefault();
        sendAction({ type: "prev" });
        return;
      }

      // Next
      if (matchesShortcut(e, miniplayer.nextTrack)) {
        e.preventDefault();
        sendAction({ type: "next" });
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPosMs, durationMs, sendAction, state.volume]);

  return (
    <div
      className="flex h-screen w-screen select-none flex-col justify-start bg-transparent antialiased overflow-hidden font-sans p-1 m-0 border-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* ── Main Overlay Card ── */}
      <motion.div
        initial={false}
        animate={{
          opacity: isVisible ? 1 : 0,
          scale: isVisible ? 1 : 0.92,
          y: isVisible || !animated ? 0 : -4,
        }}
        transition={
          animated && isVisible ? OVERLAY_CARD_SPRING : OVERLAY_CARD_TRANSITION
        }
        className="relative flex w-full shrink-0 flex-col overflow-hidden rounded-[10px] bg-[#0d0d10]"
        style={{
          height: "48px",
          willChange: "transform, opacity",
          transformOrigin: "center center",
        }}
      >
        {hasCustomBg && backgroundImage && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute inset-0 bg-[#0d0d10]" />
            <img
              src={backgroundImage}
              alt=""
              className="h-full w-full object-cover select-none"
              style={{
                filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
                transform: backgroundBlur > 0 ? "scale(1.12)" : undefined,
              }}
            />
            {backgroundDim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: backgroundDim / 100 }} />}
            <div
              className="absolute inset-0"
              style={{
                background: tintBackground,
                backdropFilter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
                WebkitBackdropFilter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
              }}
            />
          </div>
        )}

        {/* Background Progress Fill - Straight rectangular without rounding */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-[1] rounded-none"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            width: `${progressRatio * 100}%`,
            transition: "width 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />

        {/* Content Row */}
        <div className="relative z-[2] flex h-full w-full items-center justify-between px-2.5">
          {/* Left: Artwork + Track Info (Fully draggable to drag window) */}
          <div
            className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden cursor-default pr-2"
            onMouseEnter={() => setIsInfoHovered(true)}
            onMouseLeave={() => setIsInfoHovered(false)}
          >
            <motion.div
              className="relative h-[32px] w-[32px] shrink-0 overflow-hidden rounded-[12px] bg-[#16161a]"
              animate={
                animated && isLoading ? { opacity: [1, 0.5, 1] } : { opacity: 1 }
              }
              transition={
                animated && isLoading
                  ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
            >
              <AnimatePresence initial={false}>
                <motion.div
                  key={coverSrc || "empty"}
                  className="absolute inset-0"
                  initial={animated ? { opacity: 0, scale: 1.18 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={animated ? { opacity: 0 } : { opacity: 0, transition: { duration: 0 } }}
                  transition={TRACK_SWAP_TRANSITION}
                >
                  {coverSrc ? (
                    <CoverImage
                      src={coverSrc}
                      alt={state.track?.title || "Artwork"}
                      fill
                      sizes="32px"
                      priority
                      unoptimized
                      draggable={false}
                      className="rounded-[12px] object-cover pointer-events-none select-none"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] text-white/30 select-none">
                      ♪
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>

            <div className="relative flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={trackKey}
                  className="flex min-w-0 flex-col justify-center"
                  initial={animated ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    animated
                      ? { opacity: 0, y: -10 }
                      : { opacity: 0, transition: { duration: 0 } }
                  }
                  transition={TRACK_SWAP_TRANSITION}
                >
                  <ScrollableText
                    text={state.track?.title || "No track playing"}
                    isParentHovered={isInfoHovered}
                    className="text-[13px] font-normal leading-[16px] text-white tracking-tight"
                    style={{ fontFamily: "var(--font-inter), sans-serif" }}
                  />
                  <ScrollableText
                    text={state.track?.artist || ""}
                    isParentHovered={isInfoHovered}
                    className="mt-[1px] text-[11px] font-light leading-[14px] text-white/50"
                    style={{ fontFamily: "var(--font-inter), sans-serif" }}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Right: Like Button + Playback Controls (Previous, Play/Pause, Next) */}
          <div
            className="flex items-center gap-0.5 shrink-0 pl-1"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <motion.button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                sendAction({ type: "like" });
              }}
              whileHover={animated ? { scale: 1.12 } : undefined}
              whileTap={animated ? { scale: 0.82 } : undefined}
              transition={{ type: "spring", stiffness: 600, damping: 22 }}
              className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent transition-colors outline-none cursor-pointer ${
                animated ? "" : "active:scale-90"
              } ${
                state.isLiked
                  ? "text-[#ff3b5c]"
                  : "text-white/40 hover:text-white"
              }`}
              aria-label={state.isLiked ? "Unlike" : "Like"}
            >
              <LikeIcon
                isLiked={state.isLiked}
                pulseKey={likePulseKey}
                animated={animated}
              />
            </motion.button>

            <motion.button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                sendAction({ type: "prev" });
              }}
              whileTap={animated ? { scale: 0.85, x: -2 } : undefined}
              transition={{ type: "spring", stiffness: 600, damping: 22 }}
              className={`flex h-[26px] w-[26px] items-center justify-center rounded-lg border-0 bg-transparent text-white/60 hover:text-white transition-colors outline-none cursor-pointer ${
                animated ? "" : "active:scale-90"
              }`}
              aria-label="Previous"
            >
              <SkipPrevious size={16} weight="Bold" />
            </motion.button>

            <motion.button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                sendAction({ type: "togglePlay" });
              }}
              whileHover={animated ? { scale: 1.08 } : undefined}
              whileTap={animated ? { scale: 0.86 } : undefined}
              transition={{ type: "spring", stiffness: 600, damping: 20 }}
              className={`inline-flex h-[28px] w-[28px] items-center justify-center rounded-full bg-white text-black shadow border-none cursor-pointer ${
                animated
                  ? ""
                  : "transition-all duration-150 ease-out hover:scale-105 active:scale-95"
              }`}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <span
                className={`flex items-center justify-center transition-transform ${
                  isPlaying ? "" : "translate-x-[0.5px]"
                }`}
              >
                <PlayerMorphIcon
                  icon={isPlaying ? ICON_PAUSE : ICON_PLAY}
                  size={14}
                />
              </span>
            </motion.button>

            <motion.button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                sendAction({ type: "next" });
              }}
              whileTap={animated ? { scale: 0.85, x: 2 } : undefined}
              transition={{ type: "spring", stiffness: 600, damping: 22 }}
              className={`flex h-[26px] w-[26px] items-center justify-center rounded-lg border-0 bg-transparent text-white/60 hover:text-white transition-colors outline-none cursor-pointer ${
                animated ? "" : "active:scale-90"
              }`}
              aria-label="Next"
            >
              <SkipNext size={16} weight="Bold" />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default OverlayPlayer;
