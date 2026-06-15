/**
 * Stepper — Wizard progress indicator for multi-step flows.
 * Used by EmployeeProfileWizardScreen.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  createThemedStyles,
  type ThemeTokens,
} from '../../contexts/ThemeContext';

interface StepperProps {
  steps: string[];
  currentStep: number; // 0-indexed
  testID?: string;
}

export function Stepper({ steps, currentStep, testID }: StepperProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View testID={testID} style={styles.container} accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: steps.length - 1, now: currentStep }}
      accessibilityLabel={t('mobile.auth.wizard.stepProgress', {
        current: currentStep + 1,
        total: steps.length,
        label: steps[currentStep],
      })}
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;

        return (
          <React.Fragment key={step}>
            {/* Connector line */}
            {index > 0 && (
              <View
                style={[
                  styles.connector,
                  isCompleted ? styles.connectorCompleted : styles.connectorPending,
                ]}
              />
            )}

            {/* Step node */}
            <View style={styles.stepNode}>
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.circleCompleted,
                  isActive && styles.circleActive,
                  !isCompleted && !isActive && styles.circlePending,
                ]}
              >
                {isCompleted ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : (
                  <Text
                    style={[
                      styles.circleNum,
                      isActive && styles.circleNumActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isCompleted && styles.stepLabelCompleted,
                ]}
                numberOfLines={1}
              >
                {step}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    connector: {
      height: 2,
      flex: 1,
      marginTop: 14,
      marginHorizontal: -2,
    },
    connectorCompleted: {
      backgroundColor: tk.brand500,
    },
    connectorPending: {
      backgroundColor: tk.border,
    },
    stepNode: {
      alignItems: 'center',
      gap: 6,
      width: 52,
    },
    circle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleCompleted: {
      backgroundColor: tk.brand500,
    },
    circleActive: {
      backgroundColor: tk.brandCta,
      shadowColor: tk.shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    circlePending: {
      backgroundColor: tk.sunken,
      borderWidth: 2,
      borderColor: tk.border,
    },
    circleNum: {
      fontSize: 12,
      fontWeight: '700',
      color: tk.textSecondary,
    },
    circleNumActive: {
      color: tk.textOnBrand,
    },
    checkmark: {
      fontSize: 12,
      fontWeight: '800',
      color: tk.textOnBrand,
    },
    stepLabel: {
      fontSize: 10,
      fontWeight: '500',
      color: tk.textSecondary,
      textAlign: 'center',
    },
    stepLabelActive: {
      color: tk.brandFg,
      fontWeight: '700',
    },
    stepLabelCompleted: {
      color: tk.brand500,
      fontWeight: '600',
    },
  }),
);
