/**
 * EditBusinessScreen — minimal business-details editing.
 * Task #18 (GAP-060rem): replaces the hidden "Edit Business" Profile stub.
 *
 * The onboarding BusinessProfileWizard is NOT reusable here (it creates an
 * org, persists identity documents, swaps the session JWT and calls
 * markAuthenticated), so this screen edits the existing org via the
 * SEC-056 self-service endpoints:
 *   GET   /auth/org/settings   — load
 *   PATCH /auth/org/settings   — save (address/logo fields only)
 *
 * BACKEND CONTRACT NOTE: name + GSTIN are immutable through this endpoint
 * (and there is no other self-service endpoint that mutates them) — they
 * render read-only with an explanatory note.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { getOrgSettings, patchOrgSettings, type OrgSettings } from '../../api/auth';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'EditBusiness'>;
interface Props { navigation: NavProp }

interface AddressForm {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
}

export function EditBusinessScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['org-settings'],
    queryFn: getOrgSettings,
    staleTime: 60 * 1000,
    retry: false,
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.editBusiness.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.brand[600]} />
        </View>
      ) : isError || !data ? (
        <View style={styles.centerBox}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.neutral[400]} />
          <Text style={styles.errorTitle}>{t('mobile.editBusiness.error.load')}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void refetch()}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.common.retry')}
          >
            <Text style={styles.primaryBtnText}>{t('mobile.common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        // Inner form is mounted only once settings exist, so its state can be
        // initialised directly from props (no seed-effect / cascading render).
        <BusinessForm settings={data} />
      )}
    </SafeAreaView>
  );
}

function BusinessForm({ settings }: { settings: OrgSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<AddressForm>({
    addressLine1: settings.addressLine1 ?? '',
    // GET /auth/org/settings does not return addressLine2 (PATCH accepts it)
    // — backend contract gap, reported to orchestrator.
    addressLine2: '',
    city: settings.city ?? '',
    state: settings.state ?? '',
    pincode: settings.pincode ?? '',
  });
  const [saved, setSaved] = useState(false);

  const pincodeInvalid = form.pincode.length > 0 && !/^\d{6}$/.test(form.pincode);

  const saveMutation = useMutation({
    mutationFn: () =>
      patchOrgSettings({
        addressLine1: form.addressLine1 || null,
        addressLine2: form.addressLine2 || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
      }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['org-settings'] });
    },
  });

  const setField = (key: keyof AddressForm) => (value: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Read-only verified identity */}
      <View style={styles.card}>
        <Field label={t('mobile.editBusiness.name')} value={settings.name} readOnly />
        {settings.gstin ? (
          <Field label={t('mobile.editBusiness.gstin')} value={settings.gstin} readOnly mono />
        ) : null}
        <Text style={styles.readonlyNote}>{t('mobile.editBusiness.readonlyNote')}</Text>
      </View>

      {/* Editable address */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('mobile.editBusiness.address')}</Text>
        <LabeledInput
          label={t('mobile.editBusiness.addressLine1')}
          value={form.addressLine1}
          onChangeText={setField('addressLine1')}
          testID="edit-biz-address1"
        />
        <LabeledInput
          label={t('mobile.editBusiness.addressLine2')}
          value={form.addressLine2}
          onChangeText={setField('addressLine2')}
          testID="edit-biz-address2"
        />
        <LabeledInput
          label={t('mobile.editBusiness.city')}
          value={form.city}
          onChangeText={setField('city')}
          testID="edit-biz-city"
        />
        <LabeledInput
          label={t('mobile.editBusiness.state')}
          value={form.state}
          onChangeText={setField('state')}
          testID="edit-biz-state"
        />
        <LabeledInput
          label={t('mobile.editBusiness.pincode')}
          value={form.pincode}
          onChangeText={setField('pincode')}
          keyboardType="number-pad"
          maxLength={6}
          error={pincodeInvalid ? t('mobile.editBusiness.pincodeError') : undefined}
          testID="edit-biz-pincode"
        />
      </View>

      {/* Save state — live region announces result without focus change. */}
      <View accessibilityLiveRegion="polite">
        {saveMutation.isError ? (
          <Text style={styles.saveError}>{t('mobile.editBusiness.error.save')}</Text>
        ) : saved ? (
          <Text style={styles.saveSuccess}>{t('mobile.editBusiness.saved')}</Text>
        ) : null}
      </View>

      <Pressable
        style={[styles.primaryBtn, (saveMutation.isPending || pincodeInvalid) && styles.primaryBtnDisabled]}
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || pincodeInvalid}
        accessibilityRole="button"
        accessibilityState={{ disabled: saveMutation.isPending || pincodeInvalid }}
        accessibilityLabel={t('mobile.editBusiness.save')}
        testID="edit-biz-save"
      >
        {saveMutation.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>{t('mobile.editBusiness.save')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  readOnly,
  mono,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  mono?: boolean;
}) {
  return (
    <View
      style={styles.fieldRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${value}`}
    >
      <Text style={styles.fieldLabel} importantForAccessibility="no">{label}</Text>
      <Text
        style={[styles.fieldValue, mono && styles.fieldValueMono, readOnly && styles.fieldValueReadOnly]}
        importantForAccessibility="no"
      >
        {value}
      </Text>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  keyboardType,
  maxLength,
  error,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'number-pad';
  maxLength?: number;
  error?: string;
  testID?: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.input, !!error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        maxLength={maxLength}
        accessibilityLabel={label}
        accessibilityHint={error}
        testID={testID}
      />
      {error ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.inputErrorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: Colors.neutral[800], textAlign: 'center' },

  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },

  card: {
    backgroundColor: Colors.surface.default, borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 1, borderColor: Colors.neutral[100],
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900] },

  fieldRow: { gap: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.neutral[500], textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldValue: { fontSize: 15, fontWeight: '600', color: Colors.neutral[900] },
  fieldValueMono: { letterSpacing: 1 },
  fieldValueReadOnly: { color: Colors.neutral[700] },
  readonlyNote: { fontSize: 12, color: Colors.neutral[500], lineHeight: 18 },

  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.neutral[700] },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: Colors.neutral[300],
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.neutral[900],
    backgroundColor: Colors.surface.default,
  },
  inputError: { borderColor: Colors.error[500], backgroundColor: Colors.error[50] },
  inputErrorText: { fontSize: 12, color: Colors.error[600] },

  saveError: { fontSize: 13, color: Colors.error[600], textAlign: 'center' },
  saveSuccess: { fontSize: 13, color: Colors.success[700], textAlign: 'center' },

  primaryBtn: {
    backgroundColor: Colors.brand[600], borderRadius: 14,
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryBtnDisabled: { backgroundColor: Colors.neutral[200] },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
