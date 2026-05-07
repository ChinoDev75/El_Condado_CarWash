const commonPasswords = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "admin123",
  "changeme",
  "iloveyou",
  "carwash123",
  "condado123",
]);

export const plateRequirementsText = "Formato requerido: P123ASD, letra P fija, 3 numeros y 3 letras.";

export const normalizePlate = (value = "") => (
  String(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7)
);

export const getPlateIssues = (value = "") => {
  const rawPlate = String(value).toUpperCase().replace(/\s+/g, "");
  const plate = normalizePlate(value);
  const issues = [];

  if (!plate) return ["La placa es obligatoria."];
  if (/[^A-Z0-9]/.test(rawPlate)) issues.push("Solo se permiten letras y numeros, sin guiones ni simbolos.");
  if (rawPlate.length !== 7 || plate.length !== 7) issues.push("Debe tener exactamente 7 caracteres.");
  if (plate[0] !== "P") issues.push("Debe empezar con la letra P.");
  if (!/^P\d{3}[A-Z]{3}$/.test(plate)) issues.push("Formato correcto: P123ASD.");

  return issues;
};

export const isValidPlate = (value = "") => getPlateIssues(value).length === 0;

const normalizeComparableText = (value = "") => (
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
);

export const getPasswordIssues = (password = "", context = {}) => {
  const issues = [];

  if (password.length < 10) issues.push("Minimo 10 caracteres.");
  if (password.length > 128) issues.push("Maximo 128 caracteres.");
  if (/\s/.test(password)) issues.push("Sin espacios.");
  if (!/[a-z]/.test(password)) issues.push("Agrega minuscula.");
  if (!/[A-Z]/.test(password)) issues.push("Agrega mayuscula.");
  if (!/\d/.test(password)) issues.push("Agrega numero.");
  if (!/[^A-Za-z0-9\s]/.test(password)) issues.push("Agrega simbolo.");
  if (/(.)\1{3,}/.test(password)) issues.push("Evita caracteres repetidos.");

  const normalizedPassword = normalizeComparableText(password);
  if (commonPasswords.has(normalizedPassword)) issues.push("Evita contraseñas comunes.");

  const namePart = normalizeComparableText(context.name);
  if (namePart.length >= 4 && normalizedPassword.includes(namePart)) {
    issues.push("No uses tu nombre.");
  }

  const emailPart = normalizeComparableText(String(context.email || "").split("@")[0]);
  if (emailPart.length >= 4 && normalizedPassword.includes(emailPart)) {
    issues.push("No uses tu correo.");
  }

  return issues;
};

export const getPasswordStrength = (password = "", context = {}) => {
  const totalChecks = 9;
  const issueCount = getPasswordIssues(password, context).length;
  return Math.max(0, Math.min(totalChecks, totalChecks - issueCount));
};
