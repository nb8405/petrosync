const sensitiveKeyPattern =
  /(password|token|secret|api[_-]?key|authorization|credential|jwt|session)/i;

const redact = (value, depth = 0) => {
  if (depth > 6) {
    return "[Redacted]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[Redacted]" : redact(nestedValue, depth + 1),
      ])
    );
  }

  return value;
};

module.exports = {
  redact,
};
