/**
 * ImsUndoToast — success toast with a 5s Undo affordance.
 * Spec: docs/design/ims-inbox-spec.md §6.6 — the undo is a follow-up action
 * call to the prior status (PENDING maps to PENDING_KEPT; raw PENDING is not
 * reachable via the API).
 *
 * Renders a polite live region; the parent screen also announces via
 * AccessibilityInfo so VoiceOver users hear the outcome without focus moves.
 */

import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

export const IMS_UNDO_WINDOW_MS = 5000;

interface Props {
  visible: boolean;
  message: string;
  /** Omit to render an info-only toast (e.g. bulk results — no bulk undo). */
  onUndo?: () => void;
  onDismiss: () => void;
  testID?: string;
}

export function ImsUndoToast({ visible, message, onUndo, onDismiss, testID }: Props) {
  const { t } = useTranslation();
  const styles = useStyles();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      timerRef.current = setTimeout(onDismiss, IMS_UNDO_WINDOW_MS);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
    return undefined;
  }, [visible, message, onDismiss]);

  if (!visible) return null;

  return (
    <View style={styles.toast} accessibilityLiveRegion="polite" testID={testID}>
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      {onUndo ? (
        <Pressable
          style={styles.undoBtn}
          onPress={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
            onUndo();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.gst.ims.undo.label')}
          testID={testID ? `${testID}-undo` : undefined}
        >
          <Text style={styles.undoText}>{t('mobile.gst.ims.undo.label')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    toast: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: tk.textPrimary, // inverse surface — high contrast both modes
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      ...tk.elevation3,
    },
    message: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: tk.canvas,
    },
    undoBtn: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    undoText: {
      fontSize: 14,
      fontWeight: '800',
      color: tk.brand400,
      letterSpacing: 0.3,
    },
  }),
);
