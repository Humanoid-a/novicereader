export function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}