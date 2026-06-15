/**
 * StarRatingInput — Wave 7 / GAP-031.
 * Covers: tap sets value, adjustable a11y increment/decrement, value
 * announcement text, readOnly ignores interaction.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StarRatingInput } from '../../src/components/shared/StarRatingInput';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

describe('StarRatingInput', () => {
  it('renders 5 stars and taps set the value', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<StarRatingInput value={0} onChange={onChange} />);
    fireEvent.press(getByTestId('star-rating-input-star-4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('exposes adjustable role with increment/decrement actions', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<StarRatingInput value={2} onChange={onChange} />);
    const group = getByTestId('star-rating-input');
    expect(group.props.accessibilityRole).toBe('adjustable');

    fireEvent(group, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).toHaveBeenCalledWith(3);

    fireEvent(group, 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('announces "{{value}} of {{max}} stars" via accessibilityValue', () => {
    const { getByTestId } = render(
      <StarRatingInput value={3} onChange={() => undefined} />,
    );
    const group = getByTestId('star-rating-input');
    expect(group.props.accessibilityValue.now).toBe(3);
    expect(group.props.accessibilityValue.text).toContain('mobile.ca.rating.valueA11y');
  });

  it('readOnly mode ignores taps and a11y actions', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <StarRatingInput value={4} onChange={onChange} readOnly />,
    );
    fireEvent.press(getByTestId('star-rating-input-star-1'));
    fireEvent(getByTestId('star-rating-input'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps increments at max', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<StarRatingInput value={5} onChange={onChange} />);
    fireEvent(getByTestId('star-rating-input'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    // already at max — no change dispatched
    expect(onChange).not.toHaveBeenCalled();
  });
});
