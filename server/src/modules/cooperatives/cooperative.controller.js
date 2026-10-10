import { apiResponse } from "../../shared/utils/api-response.js";
import { asyncErrorHandler } from "../../shared/utils/async-handler.js";
import { registerCooperative, acceptJoinRequest } from "./cooperative.service.js";

export const registerCooperativeController = asyncErrorHandler(async (req, res) => {
  const cooperative = await registerCooperative(req.body || {});
  return res.status(201).json(new apiResponse(201, cooperative, "Cooperative registered successfully!"));
});
