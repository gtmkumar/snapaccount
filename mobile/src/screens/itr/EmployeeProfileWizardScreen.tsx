/**
 * EmployeeProfileWizardScreen — 5-step wizard for ITR assessee profile.
 * Steps: Personal → Employment → Deductions → Investments → Review
 * Persists to backend on each Next via PUT /itr/profile.
 * Phase 6D — docs/design/mobile/itr/employee-profile-wizard.md
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Stepper } from '../../components/shared/Stepper';
import { PanInput } from '../../components/shared/PanInput';
import { SummaryList } from '../../components/shared/SummaryList';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { updateItrProfile } from '../../api/itr';
import type { AssesseeType } from '../../api/itr';
import type { ItrStackParamList } from '../../navigation/ItrStack';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'EmployeeProfileWizard'>;
type RoutePropType = RouteProp<ItrStackParamList, 'EmployeeProfileWizard'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

interface WizardState {
  // Step 0: Personal
  fullName: string;
  panLast4: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
  assesseeType: AssesseeType;
  // Step 1: Employment
  annualSalary: string;
  employerName: string;
  employerTan: string;
  // Step 2: Deductions
  section80C: string;
  section80D: string;
  section80E: string;
  // Step 3: Investments
  capitalGains: string;
  housePropertyIncome: string;
  otherIncome: string;
  // Step 4: Review — derived from above
}

const STEPS = ['Personal', 'Employment', 'Deductions', 'Investments', 'Review'];

export function EmployeeProfileWizardScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { userId, assesseeId } = route.params;
  const [currentStep, setCurrentStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    fullName: '',
    panLast4: '',
    email: '',
    phone: '',
    dob: '',
    address: '',
    assesseeType: 'Individual',
    annualSalary: '',
    employerName: '',
    employerTan: '',
    section80C: '',
    section80D: '',
    section80E: '',
    capitalGains: '',
    housePropertyIncome: '',
    otherIncome: '',
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateItrProfile({
        userId,
        panLast4: state.panLast4,
        fullName: state.fullName,
        assesseeType: state.assesseeType,
        email: state.email || undefined,
        phone: state.phone || undefined,
        dob: state.dob || undefined,
        address: state.address || undefined,
      }),
  });

  const isLastStep = currentStep === STEPS.length - 1;

  const handleNext = async () => {
    // Persist on every step to avoid data loss
    try {
      await updateMutation.mutateAsync();
    } catch {
      // Non-blocking: continue wizard even if persist fails (offline resilience)
    }

    if (isLastStep) {
      navigation.navigate('DocChecklist', { assesseeId: assesseeId ?? '' });
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep === 0) {
      navigation.goBack();
    } else {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const set = (key: keyof WizardState, value: string) =>
    setState((prev) => ({ ...prev, [key]: value }));

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={handleBack} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.wizard.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stepper */}
      <Stepper steps={STEPS} currentStep={currentStep} testID="wizard-stepper" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {currentStep === 0 && (
            <StepPersonal state={state} set={set} t={t} />
          )}
          {currentStep === 1 && (
            <StepEmployment state={state} set={set} t={t} />
          )}
          {currentStep === 2 && (
            <StepDeductions state={state} set={set} t={t} />
          )}
          {currentStep === 3 && (
            <StepInvestments state={state} set={set} t={t} />
          )}
          {currentStep === 4 && (
            <StepReview state={state} onEdit={setCurrentStep} t={t} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.nextBtn, updateMutation.isPending && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={updateMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={isLastStep ? t('mobile.itr.wizard.submit') : t('mobile.itr.wizard.next')}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.nextBtnText}>
              {isLastStep ? t('mobile.itr.wizard.submit') : t('mobile.itr.wizard.next')}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ─── Step sub-components ─────────────────────────────────────────────────────

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function StepPersonal({
  state,
  set,
  t,
}: {
  state: WizardState;
  set: (k: keyof WizardState, v: string) => void;
  t: (key: string) => string;
}) {
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('mobile.itr.wizard.step0Title')}</Text>
      <FieldGroup label={t('mobile.itr.wizard.fullName')}>
        <TextInput
          style={styles.input}
          value={state.fullName}
          onChangeText={(v) => set('fullName', v)}
          placeholder="e.g. Ramesh Kumar"
          placeholderTextColor={tokens.textTertiary}
          autoCapitalize="words"
          accessibilityLabel={t('mobile.itr.wizard.fullName')}
        />
      </FieldGroup>
      <PanInput
        value={state.panLast4}
        onChangeText={(v) => set('panLast4', v.slice(-4))}
        label={t('mobile.itr.wizard.pan')}
      />
      <FieldGroup label={t('mobile.itr.wizard.email')}>
        <TextInput
          style={styles.input}
          value={state.email}
          onChangeText={(v) => set('email', v)}
          placeholder="name@email.com"
          placeholderTextColor={tokens.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          accessibilityLabel={t('mobile.itr.wizard.email')}
        />
      </FieldGroup>
      <FieldGroup label={t('mobile.itr.wizard.phone')}>
        <TextInput
          style={styles.input}
          value={state.phone}
          onChangeText={(v) => set('phone', v)}
          placeholder="+91 98765 43210"
          placeholderTextColor={tokens.textTertiary}
          keyboardType="phone-pad"
          accessibilityLabel={t('mobile.itr.wizard.phone')}
        />
      </FieldGroup>
      <FieldGroup label={t('mobile.itr.wizard.dob')}>
        <TextInput
          style={styles.input}
          value={state.dob}
          onChangeText={(v) => set('dob', v)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={tokens.textTertiary}
          accessibilityLabel={t('mobile.itr.wizard.dob')}
        />
      </FieldGroup>
      <FieldGroup label={t('mobile.itr.wizard.address')}>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={state.address}
          onChangeText={(v) => set('address', v)}
          placeholder={t('mobile.itr.wizard.addressPlaceholder')}
          placeholderTextColor={tokens.textTertiary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          accessibilityLabel={t('mobile.itr.wizard.address')}
        />
      </FieldGroup>
    </View>
  );
}

function StepEmployment({
  state,
  set,
  t,
}: {
  state: WizardState;
  set: (k: keyof WizardState, v: string) => void;
  t: (key: string) => string;
}) {
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('mobile.itr.wizard.step1Title')}</Text>
      <FieldGroup label={t('mobile.itr.wizard.annualSalary')}>
        <TextInput
          style={styles.input}
          value={state.annualSalary}
          onChangeText={(v) => set('annualSalary', v.replace(/[^0-9]/g, ''))}
          placeholder="0"
          placeholderTextColor={tokens.textTertiary}
          keyboardType="number-pad"
          accessibilityLabel={t('mobile.itr.wizard.annualSalary')}
        />
      </FieldGroup>
      <FieldGroup label={t('mobile.itr.wizard.employerName')}>
        <TextInput
          style={styles.input}
          value={state.employerName}
          onChangeText={(v) => set('employerName', v)}
          placeholder="e.g. ABC Pvt Ltd"
          placeholderTextColor={tokens.textTertiary}
          accessibilityLabel={t('mobile.itr.wizard.employerName')}
        />
      </FieldGroup>
      <FieldGroup label={t('mobile.itr.wizard.employerTan')}>
        <TextInput
          style={styles.input}
          value={state.employerTan}
          onChangeText={(v) => set('employerTan', v.toUpperCase())}
          placeholder="AAAA99999A"
          placeholderTextColor={tokens.textTertiary}
          autoCapitalize="characters"
          maxLength={10}
          accessibilityLabel={t('mobile.itr.wizard.employerTan')}
        />
      </FieldGroup>
    </View>
  );
}

function StepDeductions({
  state,
  set,
  t,
}: {
  state: WizardState;
  set: (k: keyof WizardState, v: string) => void;
  t: (key: string) => string;
}) {
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('mobile.itr.wizard.step2Title')}</Text>
      <View style={styles.infoNote}>
        <Ionicons name="information-circle-outline" size={16} color={tokens.brandCta} />
        <Text style={styles.infoNoteText}>{t('mobile.itr.wizard.deductionNote')}</Text>
      </View>
      {[
        { key: 'section80C' as keyof WizardState, label: '80C — EPF, PPF, ELSS', max: 150000 },
        { key: 'section80D' as keyof WizardState, label: '80D — Health Insurance', max: 25000 },
        { key: 'section80E' as keyof WizardState, label: '80E — Education Loan Interest', max: null },
      ].map(({ key, label, max }) => (
        <FieldGroup key={key} label={label}>
          <TextInput
            style={styles.input}
            value={state[key] as string}
            onChangeText={(v) => set(key, v.replace(/[^0-9]/g, ''))}
            placeholder="0"
            placeholderTextColor={tokens.textTertiary}
            keyboardType="number-pad"
            accessibilityLabel={label}
          />
          {max && (
            <Text style={styles.fieldHint}>Max ₹{max.toLocaleString('en-IN')}</Text>
          )}
        </FieldGroup>
      ))}
    </View>
  );
}

function StepInvestments({
  state,
  set,
  t,
}: {
  state: WizardState;
  set: (k: keyof WizardState, v: string) => void;
  t: (key: string) => string;
}) {
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('mobile.itr.wizard.step3Title')}</Text>
      {[
        { key: 'capitalGains' as keyof WizardState, label: t('mobile.itr.wizard.capitalGains') },
        { key: 'housePropertyIncome' as keyof WizardState, label: t('mobile.itr.wizard.housePropertyIncome') },
        { key: 'otherIncome' as keyof WizardState, label: t('mobile.itr.wizard.otherIncome') },
      ].map(({ key, label }) => (
        <FieldGroup key={key} label={label}>
          <TextInput
            style={styles.input}
            value={state[key] as string}
            onChangeText={(v) => set(key, v.replace(/[^0-9-]/g, ''))}
            placeholder="0"
            placeholderTextColor={tokens.textTertiary}
            keyboardType="number-pad"
            accessibilityLabel={label}
          />
        </FieldGroup>
      ))}
    </View>
  );
}

function StepReview({
  state,
  onEdit,
  t,
}: {
  state: WizardState;
  onEdit: (step: number) => void;
  t: (key: string) => string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('mobile.itr.wizard.step4Title')}</Text>
      <SummaryList
        items={[
          { label: t('mobile.itr.wizard.fullName'), value: state.fullName || '—', onEdit: () => onEdit(0) },
          { label: t('mobile.itr.wizard.pan'), value: state.panLast4 ? `****${state.panLast4}` : '—', onEdit: () => onEdit(0) },
          { label: t('mobile.itr.wizard.email'), value: state.email || '—', onEdit: () => onEdit(0) },
          { label: t('mobile.itr.wizard.annualSalary'), value: state.annualSalary ? `₹${parseInt(state.annualSalary).toLocaleString('en-IN')}` : '—', onEdit: () => onEdit(1) },
          { label: t('mobile.itr.wizard.employerName'), value: state.employerName || '—', onEdit: () => onEdit(1) },
          { label: '80C Deduction', value: state.section80C ? `₹${parseInt(state.section80C).toLocaleString('en-IN')}` : '₹0', onEdit: () => onEdit(2) },
          { label: '80D Deduction', value: state.section80D ? `₹${parseInt(state.section80D).toLocaleString('en-IN')}` : '₹0', onEdit: () => onEdit(2) },
        ]}
      />
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tk.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tk.textPrimary,
    letterSpacing: -0.2,
  },
  scrollContent: { padding: 16, gap: 16 },
  stepContent: { gap: 16 },
  stepTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: tk.textPrimary,
    letterSpacing: -0.3,
  },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
  fieldHint: { fontSize: 12, color: tk.textTertiary },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: tk.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: tk.textPrimary,
    backgroundColor: tk.raised,
  },
  textArea: {
    height: 88,
    paddingTop: 12,
  },
  infoNote: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: tk.brandTint,
    borderRadius: 10,
    padding: 12,
    alignItems: 'flex-start',
  },
  infoNoteText: {
    flex: 1,
    fontSize: 12,
    color: tk.brandFg,
    lineHeight: 17,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: tk.border,
    backgroundColor: tk.raised,
  },
  nextBtn: {
    backgroundColor: tk.itrAccent,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  }),
);
