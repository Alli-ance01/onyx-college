export function normalizeUsername(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export function normalizeEmail(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith('+') ? '+' : '';
  return `${prefix}${trimmed.replace(/\D/gu, '')}`;
}

export function normalizeLoginIdentifier(value: string): {
  email: string;
  phone: string;
  username: string;
} {
  return {
    email: normalizeEmail(value),
    phone: normalizePhone(value),
    username: normalizeUsername(value),
  };
}
