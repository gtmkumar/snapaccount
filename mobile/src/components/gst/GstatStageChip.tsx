/**
 * GstatStageChip — compact GSTAT appeal-stage indicator for notice rows.
 * Wave 7B / GAP-108 · component-library.md "Wave 7 Additions".
 * Full ladder renders in detail via StatusTimeline (vertical).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { GSTAT_STAGE_ORDER, type GstatStage } from '../../api/gst';

// Server appeal ladder (Wave 7C, forward-only): REPLY_FILED → ORDER_RECEIVED
// → APPEAL_FILED → GSTAT_PENDING → RESOLVED. NONE renders nothing.
export const GSTAT_STAGE_KEYS: Record<Exclude<GstatStage, 'NONE'>, string> = {
  REPLY_FILED: 'mobile.gst.gstat.stage.replyFiled',
  ORDER_RECEIVED: 'mobile.gst.gstat.stage.orderReceived',
  APPEAL_FILED: 'mobile.gst.gstat.stage.appealFiled',
  GSTAT_PENDING: 'mobile.gst.gstat.stage.gstatPending',
  RESOLVED: 'mobile.gst.gstat.stage.resolved',
};

const TOTAL_STAGES = GSTAT_STAGE_ORDER.length;

interface GstatStageChipProps {
  stage: GstatStage;
  testID?: string;
}

export function GstatStageChip({ stage, testID }: GstatStageChipProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  if (stage === 'NONE') return null;
  const index = GSTAT_STAGE_ORDER.indexOf(stage);
  if (index < 0) return null;
  const current = index + 1;
  const label = t(GSTAT_STAGE_KEYS[stage]);

  return (
    <View
      style={styles.chip}
      accessible
      accessibilityLabel={t('mobile.gst.gstat.stageA11y', {
        current,
        total: TOTAL_STAGES,
        label,
      })}
      testID={testID ?? `gstat-stage-chip-${stage}`}
    >
      <Ionicons name="git-branch-outline" size={11} color={tokens.gstAccent} />
      <Text style={styles.stepText}>
        {t('mobile.gst.gstat.stepShort', { current, total: TOTAL_STAGES })}
      </Text>
      <Text style={styles.labelText} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: tk.gstAccent + '14',
      alignSelf: 'flex-start',
      maxWidth: '100%',
    },
    stepText: {
      fontSize: 11,
      fontWeight: '800',
      color: tk.gstAccent,
    },
    labelText: {
      fontSize: 11,
      fontWeight: '600',
      color: tk.textSecondary,
      flexShrink: 1,
    },
  }),
);
