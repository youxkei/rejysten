export class ErrorWithFields extends Error {
  fields: object;

  constructor(message: string, fields: object) {
    super(`${message}: ${JSON.stringify(fields, null, 2)}`);
    this.fields = fields;
  }
}

export class NeverErrorWithFields extends ErrorWithFields {
  constructor(message: string, fields: object, _: never) {
    super(message, fields);
  }
}
