import React from "react";

const decimalPattern = /^\d*\.?\d*$/;

export default function NumericInput({
  className = "ppm-input",
  value,
  onChange,
  placeholder,
}) {
  const displayValue = value === undefined || value === null ? "" : String(value);

  const handleChange = (event) => {
    const nextValue = event.target.value;

    if (decimalPattern.test(nextValue)) {
      onChange(nextValue);
    }
  };

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
    />
  );
}
