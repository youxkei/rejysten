export class InconsistentError extends Error {
  fields: object;

  constructor(message: string, fields: object) {
    super(message);
    this.fields = fields;
  }
}
