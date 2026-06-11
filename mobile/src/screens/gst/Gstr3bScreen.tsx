/**
 * GSTR-3B Summary Screen
 * Review and edit GSTR-3B values before approval
 * Matches docs/design/screens/mobile/gst-filing.md §Screen 18
 */

import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBadge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Button } from '../../components/ui/Button';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatINR } from '../../lib/utils';
import apiClient from '../../lib/api';
import type { GstStackParamList } from '../../navigation/GstStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'Gstr3b'>;
type RoutePropType = RouteProp<GstStackParamList, 'Gstr3b'>;
interface Props { navigation: NavProp; route: RoutePropType }

interface TaxRow {
  rate: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
}

interface Gstr3bData {
  id: string;
  period: string;
  gstin: string;
  status: 'DRAFT' | 'PENDING_APPROVAL';
  outwardSupplies: TaxRow[];
  totalITCFromGstr2: number;
  totalITCClaimed: number;
  outputTax: number;
  netPayable: number;
  itcMismatch: number;
}

function TaxTable({ rows }: { rows: TaxRow[] }) {
  const tableStyles = useTableStyles();
  const cols = ['Rate', 'Taxable', 'IGST', 'CGST', 'SGST'];

  return (
    <View style={tableStyles.table}>
      {/* Header */}
      <View style={[tableStyles.row, tableStyles.headerRow]}>
        {cols.map((col) => (
          <Text key={col} style={tableStyles.headerCell}>{col}</Text>
        ))}
      </View>
      {/* Rows */}
      {rows.map((row, idx) => (
        <View key={idx} style={tableStyles.row}>
          <Text style={tableStyles.cell}>{row.rate}</Text>
          <Text style={tableStyles.cell}>{formatINR(row.taxableValue)}</Text>
          <Text style={tableStyles.cell}>{formatINR(row.igst)}</Text>
          <Text style={tableStyles.cell}>{formatINR(row.cgst)}</Text>
          <Text style={tableStyles.cell}>{formatINR(row.sgst)}</Text>
        </View>
      ))}
    </View>
  );
}

const useTableStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  table: { borderWidth: 1, borderColor: tk.border, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: tk.border },
  headerRow: { backgroundColor: tk.canvas },
  headerCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: tk.textSecondary,
    padding: 8,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  cell: { flex: 1, fontSize: 11, color: tk.textPrimary, padding: 8, textAlign: 'right' },
  }),
);

export function Gstr3bScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  // SEC-015: Prevent screenshots on GSTR-3B filing screen (shows tax figures and GSTIN)
  useSensitiveScreen();

  const { returnId, period } = route.params;
  const [saving, setSaving] = useState(false);

  const { data: gstr3b, isLoading } = useQuery({
    queryKey: ['gstr3b', returnId],
    queryFn: async () => {
      const res = await apiClient.get<Gstr3bData>(`/gst/returns/${returnId}`);
      return res.data;
    },
  });

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await apiClient.patch(`/gst/returns/${returnId}`, { status: 'DRAFT' });
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = () => {
    navigation.navigate('GstApproval', {
      returnId,
      returnType: 'GSTR-3B',
    });
  };

  if (isLoading || !gstr3b) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading return data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>GSTR-3B — {period}</Text>
        <Pressable style={styles.helpBtn} accessibilityLabel="Help">
          <Ionicons name="help-circle-outline" size={22} color={tokens.brand500} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Status badge */}
        <View style={styles.statusRow}>
          <Text style={styles.periodInfo}>
            Tax Period: {period} | GSTIN: {gstr3b.gstin.slice(0, 10)}...
          </Text>
          <StatusBadge status={gstr3b.status} />
        </View>

        {/* Alert */}
        <View style={styles.alertBanner}>
          <View style={styles.alertRow}>
            <Ionicons name="information-circle-outline" size={16} color={tokens.infoFg} style={styles.alertIcon} />
            <Text style={styles.alertText}>
              Auto-calculated from your documents. Please verify before submission.
            </Text>
          </View>
        </View>

        {/* Section 3.1: Outward Supplies */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>3.1 Outward Supplies (Sales)</Text>
          <TaxTable rows={gstr3b.outwardSupplies} />
        </Card>

        {/* Section 4: ITC */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>4. Input Tax Credit (ITC)</Text>

          <View style={styles.itcRow}>
            <Text style={styles.itcLabel}>ITC from GSTR-2A/2B (auto-matched)</Text>
            <AmountDisplay amount={gstr3b.totalITCFromGstr2} size="sm" />
          </View>
          <View style={styles.itcRow}>
            <Text style={styles.itcLabel}>ITC Claimed</Text>
            <AmountDisplay amount={gstr3b.totalITCClaimed} size="sm" />
          </View>

          {gstr3b.itcMismatch > 0 && (
            <View style={styles.mismatchWarning}>
              <View style={styles.mismatchRow}>
                <Ionicons name="warning-outline" size={14} color={tokens.warningFg} style={styles.mismatchIcon} />
                <Text style={styles.mismatchText}>
                  {formatINR(gstr3b.itcMismatch)} difference detected
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Section 6: Net Tax Payable */}
        <Card style={[styles.section, styles.netPayableCard]}>
          <Text style={styles.sectionTitle}>Net Tax Payable</Text>
          <View style={styles.netPayableRow}>
            <Text style={styles.netPayableFormula}>Output Tax − ITC = Net Payable</Text>
            <AmountDisplay amount={gstr3b.netPayable} size="xl" colorCode />
          </View>
          <Text style={styles.netPayableNote}>
            Pay this via GST Portal before filing
          </Text>
        </Card>
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.actionBar}>
        <Button
          label="Save Draft"
          variant="secondary"
          onPress={handleSaveDraft}
          loading={saving}
          style={styles.draftBtn}
        />
        <Button
          label="Submit for Approval"
          onPress={handleSubmitForApproval}
          style={styles.approveBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16, color: tk.textSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 20, color: tk.brand500 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: tk.textPrimary },
  helpBtn: { padding: 8 },
  scrollContent: { padding: 16, paddingBottom: 100, gap: 16 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  periodInfo: { fontSize: 12, color: tk.textSecondary, flex: 1 },
  alertBanner: {
    backgroundColor: tk.infoTint,
    borderLeftWidth: 4,
    borderLeftColor: tk.infoFg,
    padding: 12,
    borderRadius: 8,
  },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start' },
  alertIcon: { marginRight: 6, marginTop: 1 },
  alertText: { fontSize: 13, color: tk.infoFg, lineHeight: 18, flex: 1 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: tk.textPrimary, marginBottom: 12 },
  itcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  itcLabel: { fontSize: 13, color: tk.textSecondary, flex: 1 },
  mismatchWarning: {
    backgroundColor: tk.warningTint,
    padding: 10,
    borderRadius: 6,
    marginTop: 10,
  },
  mismatchRow: { flexDirection: 'row', alignItems: 'center' },
  mismatchIcon: { marginRight: 4 },
  mismatchText: { fontSize: 13, color: tk.warningFg, fontWeight: '500', flex: 1 },
  netPayableCard: { backgroundColor: tk.brandTint },
  netPayableRow: { alignItems: 'center', paddingVertical: 8 },
  netPayableFormula: { fontSize: 12, color: tk.textSecondary, marginBottom: 8 },
  netPayableNote: { fontSize: 12, color: tk.textSecondary, textAlign: 'center', marginTop: 8 },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tk.raised,
    borderTopWidth: 1,
    borderTopColor: tk.border,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 32,
  },
  draftBtn: { flex: 1 },
  approveBtn: { flex: 1.5 },
  }),
);
