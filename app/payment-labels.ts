export const BANK_ACCOUNT_LABEL = "Conta Bancaria";
export const BANK_ACCOUNT_DEPOSIT_PAYMENT = "Conta Bancaria";

function normalizePaymentText(value: string | null | undefined) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

export function isBankAccountPayment(value: string | null | undefined) {
  const payment = normalizePaymentText(value);
  return payment === "c q26" || payment === "conta q26" || payment === "conta bancaria";
}

export function paymentDisplayLabel(value: string | null | undefined, fallback = "-") {
  if (!value?.trim()) return fallback;
  return isBankAccountPayment(value) ? BANK_ACCOUNT_LABEL : value;
}

export function eventDisplayName(event: { nome?: string | null; slug?: string | null }) {
  return event.slug === "contas" ? BANK_ACCOUNT_LABEL : event.nome ?? "";
}
