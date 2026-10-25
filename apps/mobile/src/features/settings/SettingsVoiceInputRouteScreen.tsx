import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useFocusEffect } from "@react-navigation/native";
import { AsyncResult } from "effect/reactivity";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import {
  defaultVoiceTranscriptionSettings,
  WHISPER_LANGUAGES,
  type VoiceTranscriptionSettings,
  type WhisperModelId,
} from "../../lib/voiceTranscriptionSettings";
import { isWhisperAvailable } from "../../native/whisperAudio";
import {
  deleteWhisperModel,
  downloadWhisperModel,
  getWhisperModelUri,
  WHISPER_MODELS,
} from "../../native/whisperModels";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { useGlobalVoiceInput } from "../voice-input/VoiceInputProvider";
import { SettingsActionRow } from "./components/SettingsActionRow";
import { SettingsChoiceRow } from "./components/SettingsChoiceRow";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";

export function SettingsVoiceInputRouteScreen() {
  const insets = useSafeAreaInsets();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const voice = useGlobalVoiceInput();
  const [download, setDownload] = useState<{ id: WhisperModelId; progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, refreshModels] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useFocusEffect(useCallback(() => () => controller.current?.abort(), []));

  const settings = AsyncResult.isSuccess(preferences)
    ? (preferences.value.voiceTranscription ?? defaultVoiceTranscriptionSettings(Platform.OS))
    : defaultVoiceTranscriptionSettings(Platform.OS);
  const ready = AsyncResult.isSuccess(preferences) && !preferences.waiting;
  const disabled = !ready || voice.isBusy || download !== null;
  const available = isWhisperAvailable();
  const update = (patch: Partial<VoiceTranscriptionSettings>) =>
    savePreferences({
      transform: (current) => ({
        voiceTranscription: {
          ...(current.voiceTranscription ?? defaultVoiceTranscriptionSettings(Platform.OS)),
          ...patch,
        },
      }),
    });

  const startDownload = async (id: WhisperModelId) => {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setError(null);
    setDownload({ id, progress: 0 });
    try {
      await downloadWhisperModel(id, active.signal, (progress) => {
        if (!active.signal.aborted) setDownload({ id, progress });
      });
    } catch (cause) {
      if (!active.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not download the model.");
      }
    } finally {
      controller.current = null;
      setDownload(null);
      refreshModels((value) => value + 1);
    }
  };

  return (
    <SettingsScreen title="Voice input">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title="Transcription">
          {Platform.OS === "ios" ? (
            <SettingsChoiceRow
              label="Apple"
              description="Uses your device language. Requires a supported iPhone with iOS 26+."
              selected={settings.engine === "apple"}
              disabled={disabled}
              onPress={() => update({ engine: "apple" })}
            />
          ) : null}
          <SettingsChoiceRow
            label="Whisper"
            description="On-device transcription, including Russian. Download a model below."
            selected={settings.engine === "whisper"}
            separated={Platform.OS === "ios"}
            disabled={disabled || !available}
            onPress={() => update({ engine: "whisper" })}
          />
        </SettingsSection>
        {!available ? (
          <Text className="px-2 text-sm text-foreground-muted">
            Whisper requires a native build that includes Whisper support.
          </Text>
        ) : null}
        <SettingsSection title="Whisper model">
          {WHISPER_MODELS.map((model, index) => (
            <SettingsChoiceRow
              key={model.id}
              label={model.label}
              description={`${model.description}${getWhisperModelUri(model.id) ? " · Downloaded" : ""}`}
              selected={settings.model === model.id}
              separated={index > 0}
              disabled={disabled || !available}
              onPress={() => update({ model: model.id })}
            />
          ))}
        </SettingsSection>
        <SettingsSection title="Model storage">
          {download ? (
            <SettingsActionRow
              icon="xmark"
              label={`Cancel download · ${Math.floor(download.progress * 100)}%`}
              onPress={() => controller.current?.abort()}
            />
          ) : getWhisperModelUri(settings.model) ? (
            <SettingsActionRow
              icon="trash"
              label="Delete selected model"
              tone="danger"
              disabled={disabled}
              onPress={() => {
                try {
                  deleteWhisperModel(settings.model);
                  setError(null);
                  refreshModels((value) => value + 1);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Could not delete the model.");
                }
              }}
            />
          ) : (
            <SettingsActionRow
              icon="arrow.down.circle"
              label={`Download ${WHISPER_MODELS.find((model) => model.id === settings.model)!.label}`}
              disabled={disabled || !available}
              onPress={() => void startDownload(settings.model)}
            />
          )}
        </SettingsSection>
        {error ? <Text className="px-2 text-sm text-danger-foreground">{error}</Text> : null}
        <Text className="px-2 text-sm text-foreground-muted">
          All models support multiple languages. Download once using an internet connection;
          transcription then works offline. Small and Large v3 Turbo need more memory than Base;
          speed depends on your phone. Leaving this screen cancels an unfinished download.
        </Text>
        <SettingsSection title="Whisper language">
          {WHISPER_LANGUAGES.map((language, index) => (
            <SettingsChoiceRow
              key={language.id}
              label={language.label}
              selected={settings.language === language.id}
              separated={index > 0}
              disabled={disabled || !available}
              onPress={() => update({ language: language.id })}
            />
          ))}
        </SettingsSection>
        <Text className="px-2 text-sm text-foreground-muted">
          Choose Russian even if your phone uses another language. Detect language also supports
          other Whisper languages. Recordings stay on this device and are deleted after dictation.
        </Text>
      </ScrollView>
    </SettingsScreen>
  );
}
