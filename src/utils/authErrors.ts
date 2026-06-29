export const ACCOUNT_EXISTS_MESSAGE = "Anda sudah memiliki akun. Silakan masuk.";

export class AccountExistsError extends Error {
  constructor() {
    super(ACCOUNT_EXISTS_MESSAGE);
    this.name = "AccountExistsError";
  }
}
