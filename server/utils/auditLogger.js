const SENSITIVE_KEYS = /token|secret|password|authorization|key/i;

const redact = (value) => {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, nestedValue]) => {
      acc[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : redact(nestedValue);
      return acc;
    }, {});
  }

  return value;
};

exports.auditLog = (event, details = {}) => {
  const payload = {
    type: 'audit',
    event,
    at: new Date().toISOString(),
    ...redact(details)
  };

  console.log(JSON.stringify(payload));
};
