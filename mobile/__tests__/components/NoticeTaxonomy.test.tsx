/**
 * Wave 7B / GAP-108 — NoticeFormTypeBadge + GstatStageChip + NoticeRowMobile
 * taxonomy props.
 * Covers: verbatim statutory codes, code+meaning accessible name, stage chip
 * step indicator, NoticeRowMobile rendering the new badges only when given.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { NoticeFormTypeBadge } from '../../src/components/gst/NoticeFormTypeBadge';
import { GstatStageChip } from '../../src/components/gst/GstatStageChip';
import { NoticeRowMobile } from '../../src/components/shared/NoticeRowMobile';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

describe('NoticeFormTypeBadge', () => {
  it('renders the statutory code verbatim (never relabeled)', () => {
    const { getByText } = render(<NoticeFormTypeBadge formType="DRC_01B" />);
    expect(getByText('DRC-01B')).toBeTruthy();
  });

  it('accessible name carries code + plain-language meaning', () => {
    const { getByTestId } = render(<NoticeFormTypeBadge formType="ASMT_10" />);
    const badge = getByTestId('form-type-badge-ASMT_10');
    expect(badge.props.accessibilityLabel).toContain('ASMT-10');
    expect(badge.props.accessibilityLabel).toContain('mobile.gst.formType.asmt10.meaning');
  });

  it('detail mode renders the meaning text below the code', () => {
    const { getByText } = render(<NoticeFormTypeBadge formType="ADT_01" showMeaning />);
    expect(getByText('mobile.gst.formType.adt01.meaning')).toBeTruthy();
  });
});

describe('GstatStageChip', () => {
  it('shows the compact "Stage n/5" indicator + stage label (server ladder)', () => {
    const { getByText, getByTestId } = render(<GstatStageChip stage="APPEAL_FILED" />);
    expect(getByText('mobile.gst.gstat.stepShort({"current":3,"total":5})')).toBeTruthy();
    expect(getByText('mobile.gst.gstat.stage.appealFiled')).toBeTruthy();
    const chip = getByTestId('gstat-stage-chip-APPEAL_FILED');
    expect(chip.props.accessibilityLabel).toContain('mobile.gst.gstat.stageA11y');
  });

  it('renders nothing for NONE (not in appeal)', () => {
    const { toJSON } = render(<GstatStageChip stage="NONE" />);
    expect(toJSON()).toBeNull();
  });
});

describe('NoticeRowMobile — Wave 7B taxonomy props', () => {
  const base = {
    id: 'n1',
    noticeNumber: 'GST-2026-001',
    noticeType: 'ASMT_10',
    status: 'RECEIVED',
    issuedDate: '2026-06-01',
    onPress: jest.fn(),
  };

  it('renders form-type badge + GSTAT chip when provided', () => {
    const { getByText, getByTestId } = render(
      <NoticeRowMobile
        {...base}
        formType="DRC_01C"
        statutoryDeadline="2026-07-01"
        gstatStage="GSTAT_PENDING"
      />,
    );
    expect(getByText('DRC-01C')).toBeTruthy();
    expect(getByTestId('gstat-chip-GST-2026-001')).toBeTruthy();
  });

  it('falls back to the legacy type chip when no formType (graceful degrade)', () => {
    const { getByText, queryByTestId } = render(<NoticeRowMobile {...base} />);
    expect(getByText('ASMT_10')).toBeTruthy();
    expect(queryByTestId('gstat-chip-GST-2026-001')).toBeNull();
  });
});
