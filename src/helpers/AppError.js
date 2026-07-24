export default class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.publicMessage = message;
    this.fields = fields;
  }
}
