class apiError extends Error {
  constructor(
    statusCode,
    message = "Something Went Wrong!",
    errors = [],
    stack = ""
  ) {
    super(message);

    this.statusCode = statusCode;
    this.data = null;
    this.message = message;
    this.success = false;
    this.errors = errors;

    //* Ye stack trace set kar raha hai (error kaha se aaya wo location).
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { apiError };