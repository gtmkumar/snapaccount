/**
 * Stepper — Wizard progress indicator for multi-step flows.
 * Used by EmployeeProfileWizardScreen.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';

interface StepperProps {
  steps: string[];
  currentStep: number; // 0-indexed
  testID?: string;
}

export function Stepper({ steps, currentStep, testID }: StepperProps) {
  return (
    <View testID={testID} style={styles.container} accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: steps.length - 1, now: currentStep }}
      accessibilityLabel={`Step ${currentStep + 1} of ${steps.length}: ${steps[currentStep]}`}
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

const styles = StyleSheet.create({
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
    backgroundColor: Colors.brand[500],
  },
  connectorPending: {
    backgroundColor: Colors.neutral[200],
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
    backgroundColor: Colors.brand[500],
  },
  circleActive: {
    backgroundColor: Colors.brand[600],
    shadowColor: Colors.brand[600],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  circlePending: {
    backgroundColor: Colors.neutral[100],
    borderWidth: 2,
    borderColor: Colors.neutral[300],
  },
  circleNum: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.neutral[400],
  },
  circleNumActive: {
    color: '#FFFFFF',
  },
  checkmark: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.neutral[400],
    textAlign: 'center',
  },
  stepLabelActive: {
    color: Colors.brand[600],
    fontWeight: '700',
  },
  stepLabelCompleted: {
    color: Colors.brand[500],
    fontWeight: '600',
  },
});
