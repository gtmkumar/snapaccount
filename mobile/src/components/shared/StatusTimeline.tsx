/**
 * StatusTimeline Component
 * Vertical workflow timeline with step status indicators
 * Matches component-library.md §6.3
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

type StepStatus = 'completed' | 'active' | 'pending' | 'error';

interface TimelineStep {
  id: string;
  label: string;
  status: StepStatus;
  timestamp?: string;
  description?: string;
}

interface StatusTimelineProps {
  steps: TimelineStep[];
  currentStep?: string;
  orientation?: 'horizontal' | 'vertical';
}

export function StatusTimeline({
  steps,
  orientation = 'vertical',
}: StatusTimelineProps) {
  if (orientation === 'horizontal') {
    return <HorizontalTimeline steps={steps} />;
  }
  return <VerticalTimeline steps={steps} />;
}

function VerticalTimeline({ steps }: { steps: TimelineStep[] }) {
  const styles = useStyles();
  return (
    <View style={styles.verticalContainer}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <View key={step.id} style={styles.stepRow}>
            {/* Left column: dot + line */}
            <View style={styles.dotColumn}>
              <StepDot status={step.status} />
              {!isLast && (
                <View
                  style={[
                    styles.connector,
                    step.status === 'completed'
                      ? styles.connectorCompleted
                      : styles.connectorPending,
                  ]}
                />
              )}
            </View>

            {/* Right column: label + timestamp */}
            <View style={styles.stepContent}>
              <Text
                style={[
                  styles.stepLabel,
                  step.status === 'active' && styles.stepLabelActive,
                  step.status === 'completed' && styles.stepLabelCompleted,
                  step.status === 'pending' && styles.stepLabelPending,
                  step.status === 'error' && styles.stepLabelError,
                ]}
              >
                {step.label}
              </Text>
              {step.description && (
                <Text style={styles.stepDescription}>{step.description}</Text>
              )}
              {step.timestamp && (
                <Text style={styles.stepTimestamp}>{step.timestamp}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function HorizontalTimeline({ steps }: { steps: TimelineStep[] }) {
  const styles = useStyles();
  return (
    <View style={styles.horizontalContainer}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <View key={step.id} style={styles.hStepContainer}>
            <View style={styles.hDotRow}>
              {/* Left connector */}
              {index > 0 && (
                <View
                  style={[
                    styles.hConnector,
                    steps[index - 1].status === 'completed'
                      ? styles.connectorCompleted
                      : styles.connectorPending,
                  ]}
                />
              )}
              <StepDot status={step.status} />
              {/* Right connector */}
              {!isLast && (
                <View
                  style={[
                    styles.hConnector,
                    step.status === 'completed'
                      ? styles.connectorCompleted
                      : styles.connectorPending,
                  ]}
                />
              )}
            </View>
            <Text
              style={[
                styles.hStepLabel,
                step.status === 'active' && styles.stepLabelActive,
              ]}
              numberOfLines={2}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function StepDot({ status }: { status: StepStatus }) {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.dot,
        status === 'completed' && styles.dotCompleted,
        status === 'active' && styles.dotActive,
        status === 'pending' && styles.dotPending,
        status === 'error' && styles.dotError,
      ]}
    >
      {status === 'completed' && (
        <Text style={styles.dotCheck}>✓</Text>
      )}
      {status === 'error' && (
        <Text style={styles.dotCheck}>✕</Text>
      )}
    </View>
  );
}

const DOT_SIZE = 20;
const CONNECTOR_WIDTH = 2;

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  // Vertical
  verticalContainer: {
    paddingLeft: 4,
  },
  stepRow: {
    flexDirection: 'row',
    minHeight: 48,
  },
  dotColumn: {
    alignItems: 'center',
    width: DOT_SIZE + 8,
    marginRight: 12,
  },
  connector: {
    flex: 1,
    width: CONNECTOR_WIDTH,
    minHeight: 20,
    marginVertical: 2,
  },
  connectorCompleted: {
    backgroundColor: tk.successFg,
  },
  connectorPending: {
    backgroundColor: tk.border,
    // dashed effect via border
  },
  stepContent: {
    flex: 1,
    paddingBottom: 16,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: tk.textSecondary,
  },
  stepLabelActive: {
    color: tk.brand500,
    fontWeight: '700',
  },
  stepLabelCompleted: {
    color: tk.textSecondary,
  },
  stepLabelPending: {
    color: tk.textTertiary,
  },
  stepLabelError: {
    color: tk.errorFg,
  },
  stepDescription: {
    fontSize: 12,
    color: tk.textSecondary,
    marginTop: 2,
  },
  stepTimestamp: {
    fontSize: 11,
    color: tk.textTertiary,
    marginTop: 2,
  },

  // Dot styles
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: tk.border,
    backgroundColor: tk.raised,
  },
  dotCompleted: {
    backgroundColor: tk.successFg,
    borderColor: tk.successFg,
  },
  dotActive: {
    backgroundColor: tk.brand500,
    borderColor: tk.brand500,
    // Pulsing indicator would require Animated API
  },
  dotPending: {
    backgroundColor: tk.raised,
    borderColor: tk.border,
  },
  dotError: {
    backgroundColor: tk.errorCta,
    borderColor: tk.errorCta,
  },
  dotCheck: {
    color: tk.textOnBrand,
    fontSize: 11,
    fontWeight: '700',
  },

  // Horizontal
  horizontalContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hStepContainer: {
    flex: 1,
    alignItems: 'center',
  },
  hDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  hConnector: {
    flex: 1,
    height: CONNECTOR_WIDTH,
  },
  hStepLabel: {
    fontSize: 10,
    textAlign: 'center',
    color: tk.textSecondary,
    marginTop: 6,
  },
  }),
);
