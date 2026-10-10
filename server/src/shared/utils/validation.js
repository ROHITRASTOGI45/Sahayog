const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordRegex =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

const indianPhoneRegex = /^[6-9]\d{9}$/;

const indianPincodeRegex = /^[1-9]\d{5}$/;


const isValidEmail = (email) => {
  return emailRegex.test(email.trim());
};

const isValidPassword = (password) => {
  return passwordRegex.test(password);
};

const isValidIndianPhone = (phone) => {
  return indianPhoneRegex.test(phone.trim());
};

const isValidIndianPincode = (pincode) => {
  return indianPincodeRegex.test(pincode.trim());
};


export {
  isValidEmail,
  isValidPassword,
  isValidIndianPhone,
  isValidIndianPincode,
};