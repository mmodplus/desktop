import { useState, useEffect } from "react";
import { useTranslation } from "@/languages";
import { usePlayerStore, useBlockedArtistsStore } from "@/features/player";
import { Button, ToggleSwitch } from "@/shared/ui";
import {
  SettingBlock,
  SettingRow,
  SettingSection,
  SegmentedControl,
} from "../controls";

function BlockedArtistsSetting({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const artists = useBlockedArtistsStore((state) => state.artists);
  const unblockArtist = useBlockedArtistsStore((state) => state.unblockArtist);

  return (
    <SettingBlock
      title={t("settings.blocked_artists.title")}
      description={t("settings.blocked_artists.description")}
      titleKey="settings.blocked_artists.title"
      descKey="settings.blocked_artists.description"
      searchQuery={searchQuery}
    >
      {artists.length === 0 ? (
        <span className="text-text-tertiary text-[13px]">
          {t("settings.blocked_artists.empty")}
        </span>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {artists.map((artist) => (
            <div
              key={artist.id ?? artist.name}
              className="flex items-center justify-between gap-[12px]"
            >
              <span className="min-w-0 truncate text-text-primary text-[13px]">
                {artist.name}
              </span>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                className="shrink-0"
                onClick={() => unblockArtist(artist)}
              >
                {t("settings.blocked_artists.unblock")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </SettingBlock>
  );
}

export function PlaybackTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const autoplaySimilar = usePlayerStore((state) => state.autoplaySimilar);
  const setAutoplaySimilar = usePlayerStore(
    (state) => state.setAutoplaySimilar,
  );
  const trackDoubleClickBehavior = usePlayerStore(
    (state) => state.trackDoubleClickBehavior,
  );
  const setTrackDoubleClickBehavior = usePlayerStore(
    (state) => state.setTrackDoubleClickBehavior,
  );
  const defaultPlaybackContext = usePlayerStore(
    (state) => state.defaultPlaybackContext,
  );
  const setDefaultPlaybackContext = usePlayerStore(
    (state) => state.setDefaultPlaybackContext,
  );
  const pauseOnDeviceChange = usePlayerStore(
    (state) => state.pauseOnDeviceChange,
  );
  const setPauseOnDeviceChange = usePlayerStore(
    (state) => state.setPauseOnDeviceChange,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SettingSection>

      <SettingRow
        title={t("settings.autoplay_similar.title")}
        description={t("settings.autoplay_similar.description")}
        titleKey="settings.autoplay_similar.title"
        descKey="settings.autoplay_similar.description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={autoplaySimilar}
            onChange={setAutoplaySimilar}
          />
        }
      />

      <SettingRow
        title={t("settings.track_double_click.title")}
        description={t("settings.track_double_click.description")}
        titleKey="settings.track_double_click.title"
        descKey="settings.track_double_click.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <SegmentedControl
              ariaLabel={t("settings.track_double_click.title")}
              value={trackDoubleClickBehavior}
              onChange={setTrackDoubleClickBehavior}
              options={[
                {
                  value: "play",
                  label: t("settings.track_double_click.play"),
                },
                {
                  value: "queue",
                  label: t("settings.track_double_click.queue"),
                },
              ]}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingRow
        title={t("settings.default_playback_context.title")}
        description={t("settings.default_playback_context.description")}
        explained
        titleKey="settings.default_playback_context.title"
        descKey="settings.default_playback_context.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <SegmentedControl
              ariaLabel={t("settings.default_playback_context.title")}
              value={defaultPlaybackContext}
              onChange={setDefaultPlaybackContext}
              options={[
                {
                  value: "resume",
                  label: t("settings.default_playback_context.resume"),
                },
                {
                  value: "empty",
                  label: t("settings.default_playback_context.empty"),
                },
              ]}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingRow
        title={t("settings.audio.pause_on_device_change.title")}
        description={t("settings.audio.pause_on_device_change.description")}
        titleKey="settings.audio.pause_on_device_change.title"
        descKey="settings.audio.pause_on_device_change.description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={pauseOnDeviceChange}
            onChange={setPauseOnDeviceChange}
          />
        }
      />

      <BlockedArtistsSetting searchQuery={searchQuery} />
    </SettingSection>
  );
}
