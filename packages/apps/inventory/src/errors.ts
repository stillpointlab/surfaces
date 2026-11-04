/**
 * The error the inventory app's pure modules throw when they reject input.
 * It carries no HTTP status: the host (the inventory service and the web
 * export routes) maps it back to the `ApiError` it surfaced before, with the
 * same status, code and message, so responses do not change.
 */
export class InventoryRuleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'InventoryRuleError';
    this.code = code;
  }
}
