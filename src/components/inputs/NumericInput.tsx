import React, {useEffect, useState} from 'react';
import {formatCurrency, formatMeasureInput, parseFlexibleNumberInput} from '../../lib/utils';

type NumericInputFormat = 'none' | 'number' | 'currency';

type NumericInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'onBlur' | 'inputMode'> & {
  value: number | string;
  onValueChange: (value: number, rawValue: string) => void;
  decimals?: number;
  formatOnBlur?: NumericInputFormat;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

const displayValue = (value: number | string, format: NumericInputFormat, decimals: number) => {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'string' && !/\d/.test(value)) return value;
  const numericValue = typeof value === 'number' ? value : parseFlexibleNumberInput(value);
  if (!Number.isFinite(numericValue)) return String(value);
  if (format === 'currency') return formatCurrency(numericValue);
  if (format === 'number') return formatMeasureInput(numericValue, decimals);
  return String(value);
};

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onValueChange,
  decimals = 2,
  formatOnBlur,
  onFocus,
  onBlur,
  onWheel,
  ...props
}) => {
  const blurFormat: NumericInputFormat = formatOnBlur ?? 'none';
  const [text, setText] = useState(() => displayValue(value, blurFormat, decimals));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(displayValue(value, blurFormat, decimals));
  }, [blurFormat, decimals, editing, value]);

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(event) => {
        setEditing(true);
        setText(String(value ?? ''));
        onFocus?.(event);
      }}
      onChange={(event) => {
        const nextText = event.target.value;
        setText(nextText);
        onValueChange(parseFlexibleNumberInput(nextText), nextText);
      }}
      onBlur={(event) => {
        setEditing(false);
        setText(displayValue(event.target.value, blurFormat, decimals));
        onBlur?.(event);
      }}
      onWheel={(event) => {
        event.currentTarget.blur();
        onWheel?.(event);
      }}
    />
  );
};

export const CurrencyInput: React.FC<Omit<NumericInputProps, 'formatOnBlur'>> = (props) => (
  <NumericInput {...props} formatOnBlur="currency" decimals={2} />
);
