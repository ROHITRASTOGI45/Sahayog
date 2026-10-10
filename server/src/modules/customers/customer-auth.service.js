import { Customer } from "./customer.model.js";
import { apiError } from "../../shared/utils/api-error.js";

const loginCustomerService = async ({ email, password }) => {
  if (!email?.trim() || !password?.trim()) {
    throw new apiError(400, "Email and password are required!");
  }

  const customer = await Customer.findOne({
    email: email.trim().toLowerCase(),
  }).select("+password +refreshToken");

  if (!customer) {
    throw new apiError(401, "Invalid email or password!");
  }

  if (!customer.isActive) {
    throw new apiError(403, "Customer account is inactive!");
  }

  const isPasswordValid = await customer.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new apiError(401, "Invalid email or password!");
  }

  const accessToken = customer.generateAccessToken();
  const refreshToken = customer.generateRefreshToken();

  customer.refreshToken = refreshToken;

  await customer.save({
    validateBeforeSave: false,
  });

  const loggedInCustomer = await Customer.findById(customer._id).select(
    "-password -refreshToken"
  );

  if (!loggedInCustomer) {
    throw new apiError(500, "Failed to fetch logged-in customer!");
  }

  return {
    customer: loggedInCustomer,
    accessToken,
    refreshToken,
  };
};

export { loginCustomerService };
