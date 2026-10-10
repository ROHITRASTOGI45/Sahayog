//* if any error found in Middleware code in express, so this code helps to find the exact error.

const asyncErrorHandler = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

export { asyncErrorHandler };
