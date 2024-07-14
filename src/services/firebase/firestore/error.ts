export class InconsistentError extends Error {
  fields: object;

  constructor(message: string, fields: object) {
    super(`${message}: ${JSON.stringify(fields, null, 2)}`);
    this.fields = fields;
  }
}
