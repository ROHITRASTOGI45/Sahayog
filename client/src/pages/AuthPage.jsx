import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import logo from "../assets/logo.png";
import {
  UserRound,
  Wrench,
  Building2,
  ArrowLeft,
  ArrowRight,
  LogIn,
  UserPlus,
  MapPin,
} from "lucide-react";

function AuthSubmitButton({ loading, loadingText, icon, className, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-80`}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
          />
          <span role="status" aria-live="polite">{loadingText}</span>
        </>
      ) : (
        <>{icon}{children}</>
      )}
    </button>
  );
}

function AuthPage({ onBackHome, onAuthenticated, initialRole = null, initialAuthMode = null, onRouteChange }) {

  // AUTHENTICATION UI STATE
  // selectedRole = Customer / Worker / Cooperative Owner
 
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [authMode, setAuthMode] = useState(initialAuthMode);
  const [registrationSuccess, setRegistrationSuccess] = useState(null);
  const [loadingActions, setLoadingActions] = useState({});
  const submissionLocks = useRef(new Set());

  const beginSubmission = (action) => {
    if (submissionLocks.current.has(action)) return false;
    submissionLocks.current.add(action);
    setLoadingActions((previous) => ({ ...previous, [action]: true }));
    return true;
  };

  const endSubmission = (action) => {
    submissionLocks.current.delete(action);
    setLoadingActions((previous) => ({ ...previous, [action]: false }));
  };

  // CUSTOMER REGISTRATION FORM STATE

  const [customerForm, setCustomerForm] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
    houseFlat: "",
    area: "",
    city: "",
    state: "",
    pincode: "",
  });

  const [profileImage, setProfileImage] = useState(null);

 
  const [customerLogin, setCustomerLogin] = useState({
    email: "",
    password: "",
  });

  const roles = {
    customer: {
      title: "Customer",
      icon: UserRound,
      color: "#16845f",
      softColor: "bg-[#16845f]/10",
      description:
        "Find trusted skilled workers and book services for your household or community.",
    },
    worker: {
      title: "Worker",
      icon: Wrench,
      color: "#e67e22",
      softColor: "bg-[#e67e22]/10",
      description:
        "Showcase your skills, connect with opportunities, and serve customers through your cooperative.",
    },
    cooperative: {
      title: "Cooperative Owner",
      icon: Building2,
      color: "#12345b",
      softColor: "bg-[#12345b]/10",
      description:
        "Manage your cooperative and coordinate skilled workers through Sahayog.",
    },
  };

  // ------------------------------------------------------------
  // ROLE SELECTION
  // ------------------------------------------------------------
  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setAuthMode(null);

    if (onRouteChange) {
      onRouteChange("/auth");
    }
  };

  const handleBackToRoles = () => {
    setSelectedRole(null);
    setAuthMode(null);
    if (onRouteChange) onRouteChange("/auth");
  };

  const handleAuthModeSelect = (mode) => {
    setAuthMode(mode);

    if (!onRouteChange) return;

    if (selectedRole === "customer") {
      onRouteChange(mode === "login" ? "/customer/login" : "/customer/register");
    } else if (selectedRole === "worker") {
      onRouteChange(mode === "login" ? "/worker/login" : "/worker/register");
    } else {
      onRouteChange(mode === "login" ? "/cooperative/login" : "/cooperative/register");
    }
  };

  // Return completely to the three role cards.

  // ============================================================
  // WORKER REGISTRATION + LOGIN
 

  const [workerForm, setWorkerForm] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
    profileImage: null,
    profilePreview: "",
    houseFlat: "",
    area: "",
    city: "",
    state: "",
    pincode: "",
    registrationLatitude: null,
    registrationLongitude: null,
  });
  const [workerServices, setWorkerServices] = useState({});
  const [workerRegistrationLocationStatus, setWorkerRegistrationLocationStatus] = useState("");

  const [workerLogin, setWorkerLogin] = useState({
    email: "",
    password: "",
  });

  const [cooperativeLogin, setCooperativeLogin] = useState({
    email: "",
    password: "",
  });

  const [cooperativeForm, setCooperativeForm] = useState({
    cooperativeName: "",
    registrationNumber: "",
    description: "",
    cooperativeEmail: "",
    cooperativePhone: "",
    adminFullName: "",
    adminEmail: "",
    adminPhone: "",
    password: "",
    confirmPassword: "",
    house: "",
    area: "",
    city: "",
    state: "",
    pincode: "",
    latitude: null,
    longitude: null,
  });
  const [cooperativeLocationStatus, setCooperativeLocationStatus] = useState("");
  const [cooperativeProfileImage, setCooperativeProfileImage] = useState(null);


  const handleWorkerChange = (event) => {
    const { name, value } = event.target;

    setWorkerForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleWorkerLoginChange = (event) => {
    const { name, value } = event.target;

    setWorkerLogin((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCooperativeChange = (event) => {
    const { name, value } = event.target;
    setCooperativeForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCooperativeLoginChange = (event) => {
    const { name, value } = event.target;
    setCooperativeLogin((prev) => ({ ...prev, [name]: value }));
  };

  const handleCooperativeLocation = () => {
    if (!navigator.geolocation) {
      setCooperativeLocationStatus("Location is not supported by this browser.");
      return;
    }
    setCooperativeLocationStatus("Detecting your location...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCooperativeForm((prev) => ({ ...prev, latitude: coords.latitude, longitude: coords.longitude }));
        setCooperativeLocationStatus("Location detected successfully.");
      },
      () => setCooperativeLocationStatus("Unable to detect location. Please allow location access and try again."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleCooperativeLoginSubmit = async (event) => {
    event.preventDefault();
    if (!cooperativeLogin.email || !cooperativeLogin.password) return alert("Please enter your email and password.");
    if (!beginSubmission("cooperativeLogin")) return;
    try {
      const data = await api("/cooperative-admin/login", { method: "POST", body: JSON.stringify(cooperativeLogin) });
      onAuthenticated("cooperative", data.data.cooperativeAdmin);
    } catch (error) {
      alert(error.message);
    } finally {
      endSubmission("cooperativeLogin");
    }
  };

  const handleCooperativeRegister = async (event) => {
    event.preventDefault();
    const required = [cooperativeForm.cooperativeName, cooperativeForm.registrationNumber, cooperativeForm.cooperativeEmail, cooperativeForm.cooperativePhone, cooperativeForm.adminFullName, cooperativeForm.adminEmail, cooperativeForm.adminPhone, cooperativeForm.password, cooperativeForm.confirmPassword, cooperativeForm.area, cooperativeForm.city, cooperativeForm.state, cooperativeForm.pincode];
    if (required.some((value) => !String(value || "").trim())) return alert("Please fill all required fields.");
    if (cooperativeForm.password !== cooperativeForm.confirmPassword) return alert("Passwords do not match.");
    if (cooperativeForm.latitude === null || cooperativeForm.longitude === null) return alert("Please use Current Location. Cooperative location is required.");
    if (!beginSubmission("cooperativeRegister")) return;
    try {
      const form = new FormData();
      form.append("cooperative", JSON.stringify({
        name: cooperativeForm.cooperativeName,
        registrationNumber: cooperativeForm.registrationNumber,
        type: "LABOUR_COOPERATIVE",
        description: cooperativeForm.description,
        email: cooperativeForm.cooperativeEmail,
        phone: cooperativeForm.cooperativePhone,
        address: { house: cooperativeForm.house, area: cooperativeForm.area, city: cooperativeForm.city, state: cooperativeForm.state, pincode: cooperativeForm.pincode },
        location: { type: "Point", coordinates: [Number(cooperativeForm.longitude), Number(cooperativeForm.latitude)] },
      }));
      form.append("admin", JSON.stringify({ fullName: cooperativeForm.adminFullName, email: cooperativeForm.adminEmail, phone: cooperativeForm.adminPhone, password: cooperativeForm.password }));
      if (cooperativeProfileImage) form.append("profilePhoto", cooperativeProfileImage);
      const data = await api("/cooperative-admin/register-owner", { method: "POST", body: form });
      setRegistrationSuccess({
        role: "cooperative",
        title: "Registration successful",
        message: data.message || "Your cooperative registration has been submitted for verification.",
      });
    } catch (error) {
      alert(error.message);
    } finally {
      endSubmission("cooperativeRegister");
    }
  };

  const handleWorkerProfileImage = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(extension)) {
      alert("Please choose a JPG, JPEG, PNG or WEBP image.");
      event.target.value = "";
      return;
    }

    if (file.size < 100 * 1024) {
      alert("Profile photo must be at least 100 KB.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Profile photo must not exceed 5 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setWorkerForm((prev) => ({
        ...prev,
        profileImage: file,
        profilePreview: String(reader.result || ""),
      }));
    };
    reader.readAsDataURL(file);
  };

  const toggleWorkerService = (service) => {
    setWorkerServices((prev) => {
      if (prev[service]) {
        const updated = { ...prev };
        delete updated[service];
        return updated;
      }

      return {
        ...prev,
        [service]: {
          experience: "",
          skillLevel: "BEGINNER",
        },
      };
    });
  };

  const updateWorkerService = (service, field, value) => {
    setWorkerServices((prev) => ({
      ...prev,
      [service]: {
        ...prev[service],
        [field]: value,
      },
    }));
  };

  const handleWorkerRegistrationLocation = () => {
    if (!navigator.geolocation) {
      setWorkerRegistrationLocationStatus("Location is not supported by this browser.");
      return;
    }

    setWorkerRegistrationLocationStatus("Detecting your registration area...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = Number(coords.latitude);
        const longitude = Number(coords.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setWorkerRegistrationLocationStatus("Unable to read valid coordinates.");
          return;
        }
        setWorkerForm((prev) => ({
          ...prev,
          registrationLatitude: latitude,
          registrationLongitude: longitude,
        }));
        setWorkerRegistrationLocationStatus("Registration area detected. This will be used for cooperative discovery and joining.");
      },
      (error) => {
        const message = error?.code === 1
          ? "Location permission denied. Please allow location access to continue."
          : error?.code === 2
            ? "Location is unavailable. Please check your device location settings."
            : error?.code === 3
              ? "Location request timed out. Please try again."
              : "Unable to detect your registration area.";
        setWorkerRegistrationLocationStatus(message);
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  };

  const handleWorkerRegister = async (event) => {
    event.preventDefault();
    const requiredFields = [workerForm.fullName, workerForm.email, workerForm.phoneNumber, workerForm.password, workerForm.confirmPassword, workerForm.area, workerForm.city, workerForm.state, workerForm.pincode];
    if (requiredFields.some((field) => !String(field || "").trim())) return alert("Please fill all required fields.");
    if (workerForm.password !== workerForm.confirmPassword) return alert("Passwords do not match.");
    if (workerForm.registrationLatitude === null || workerForm.registrationLongitude === null) return alert("Please use Detect Registration Area. This location is required to identify cooperatives in your area.");
    if (!Object.keys(workerServices).length) return alert("Please select at least one service.");
    if (Object.values(workerServices).some((d) => d.experience === "")) return alert("Please enter experience for every selected service.");
    if (!beginSubmission("workerRegister")) return;
    try {
      const form = new FormData();
      form.append("fullName", workerForm.fullName); form.append("email", workerForm.email); form.append("phone", workerForm.phoneNumber); form.append("password", workerForm.password);
      form.append("address", JSON.stringify({ house: workerForm.houseFlat, area: workerForm.area, city: workerForm.city, state: workerForm.state, pincode: workerForm.pincode }));
      form.append("registrationLocation", JSON.stringify({
        type: "Point",
        coordinates: [Number(workerForm.registrationLongitude), Number(workerForm.registrationLatitude)],
        area: workerForm.area,
        city: workerForm.city,
        state: workerForm.state,
        pincode: workerForm.pincode,
      }));
      form.append("skills", JSON.stringify(Object.entries(workerServices).map(([service, d]) => ({ service, experienceYears: Number(d.experience), skillLevel: d.skillLevel }))));
      if (workerForm.profileImage) form.append("profilePhoto", workerForm.profileImage);
      const data = await api("/workers/register", { method: "POST", body: form });
      setRegistrationSuccess({
        role: "worker",
        title: "Registration successful",
        message: data.message || "Your worker account has been created successfully.",
      });
    } catch (error) { alert(error.message); }
    finally { endSubmission("workerRegister"); }
  };

  const handleWorkerLoginSubmit = async (event) => {
    event.preventDefault();
    if (!workerLogin.email || !workerLogin.password) return alert("Please enter your email and password.");
    if (!beginSubmission("workerLogin")) return;
    try { const data = await api("/workers/login", { method: "POST", body: JSON.stringify(workerLogin) }); onAuthenticated("worker", data.data.worker); }
    catch (error) { alert(error.message); }
    finally { endSubmission("workerLogin"); }
  };

  // Return from a Login/Register form to the Login/Register choice.
  const handleBackToAuthChoice = () => {
    setAuthMode(null);
    if (onRouteChange) onRouteChange("/auth");
  };

  // ------------------------------------------------------------
  // CUSTOMER FORM HANDLERS
  // ------------------------------------------------------------

  // Updates one customer form field.
  const handleCustomerChange = (event) => {
    const { name, value } = event.target;

    setCustomerForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ------------------------------------------------------------
  // CUSTOMER LOGIN
  // ------------------------------------------------------------
  const handleCustomerLoginChange = (event) => {
    const { name, value } = event.target;

    setCustomerLogin((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ------------------------------------------------------------
  // CUSTOMER LOGIN SUBMIT
  // ------------------------------------------------------------
  const handleCustomerLoginSubmit = async (event) => {
    event.preventDefault();
    if (!customerLogin.email || !customerLogin.password) return alert("Please enter your email and password.");
    if (!beginSubmission("customerLogin")) return;
    try { const data = await api("/customers/login", { method: "POST", body: JSON.stringify(customerLogin) }); onAuthenticated("customer", data.data.customer); }
    catch (error) { alert(error.message); }
    finally { endSubmission("customerLogin"); }
  };

  // ------------------------------------------------------------
  // PROFILE IMAGE
  // ------------------------------------------------------------

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0] || null;
    setProfileImage(file);
  };

  // ------------------------------------------------------------
  // CUSTOMER REGISTRATION SUBMIT

  // ------------------------------------------------------------
  const handleCustomerSubmit = async (event) => {
    event.preventDefault();
    if (customerForm.password !== customerForm.confirmPassword) return alert("Password and Confirm Password must match.");
    if (!beginSubmission("customerRegister")) return;
    try {
      const form = new FormData();
      form.append("fullname", customerForm.fullName);
      form.append("email", customerForm.email);
      form.append("phone", customerForm.phoneNumber);
      form.append("password", customerForm.password);
      form.append("address", JSON.stringify({ house: customerForm.houseFlat, area: customerForm.area, city: customerForm.city, state: customerForm.state, pincode: customerForm.pincode }));
      if (profileImage) form.append("profilePhoto", profileImage);
      const data = await api("/customers/register", { method: "POST", body: form });
      setRegistrationSuccess({
        role: "customer",
        title: "Registration successful",
        message: data.message || "Your customer account has been created successfully.",
      });
    } catch (error) { alert(error.message); }
    finally { endSubmission("customerRegister"); }
  };

  const closeRegistrationSuccess = () => {
    const role = registrationSuccess?.role;
    setRegistrationSuccess(null);
    setAuthMode("login");
    if (onRouteChange && role) onRouteChange(`/${role}/login`);
  };

  return (
    <div className="min-h-screen bg-[#f8fbfd] text-[#12345b]">

      {/* ================= HEADER ================= */}
      <header className="border-b border-[#dce8e3] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

          {/* Sahayog Logo + Name */}
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Sahayog Logo"
              className="h-12 w-12 object-contain"
            />

            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#12345b]">
                Sahayog
              </h1>

              <p className="text-xs text-gray-500">
                People • Skills • Stronger Communities
              </p>
            </div>
          </div>

          {/* Back to Home */}
          <button
            type="button"
            onClick={onBackHome}
            className="flex items-center gap-2 text-sm font-medium text-[#12345b] transition hover:text-[#16845f]"
          >
            <ArrowLeft size={17} />
            Back to Home
          </button>
        </div>
      </header>

      {/* ================= MAIN CONTENT ================= */}
      <main className="relative min-h-[calc(100vh-81px)] overflow-hidden px-6 py-12">

        {/* Soft green background decoration */}
        <div className="pointer-events-none absolute left-[-120px] top-20 h-72 w-72 rounded-full bg-[#16845f]/10 blur-3xl" />

        {/* Soft orange background decoration */}
        <div className="pointer-events-none absolute right-[-120px] top-10 h-80 w-80 rounded-full bg-[#e67e22]/10 blur-3xl" />

        <div className="relative z-10 mx-auto w-full max-w-5xl">

          {/* ================= ROLE SELECTION ================= */}
          {!selectedRole && (
            <>
              <div className="mx-auto mb-12 max-w-2xl text-center">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#16845f]">
                  Welcome to Sahayog
                </p>

                <h2 className="text-4xl font-bold tracking-tight text-[#12345b] sm:text-5xl">
                  How do you want to continue?
                </h2>

                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#526b86] sm:text-lg">
                  Choose your role to continue with Sahayog.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-3">

                {/* Customer */}
                <button
                  type="button"
                  onClick={() => handleRoleSelect("customer")}
                  className="group rounded-3xl border border-[#dce7ef] bg-white p-8 text-left shadow-lg shadow-[#12345b]/5 transition duration-300 hover:-translate-y-2 hover:border-[#16845f]/40 hover:shadow-xl"
                >
                  <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#16845f]/10 text-[#16845f] transition duration-300 group-hover:bg-[#16845f] group-hover:text-white">
                    <UserRound size={30} />
                  </div>

                  <h3 className="text-2xl font-bold text-[#12345b]">
                    Customer
                  </h3>

                  <p className="mt-3 leading-6 text-[#526b86]">
                    Find trusted skilled workers and book services for your
                    household or community.
                  </p>

                  <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#16845f]">
                    Continue as Customer
                    <ArrowRight size={16} />
                  </div>
                </button>

                {/* Worker */}
                <button
                  type="button"
                  onClick={() => handleRoleSelect("worker")}
                  className="group rounded-3xl border border-[#dce7ef] bg-white p-8 text-left shadow-lg shadow-[#12345b]/5 transition duration-300 hover:-translate-y-2 hover:border-[#e67e22]/40 hover:shadow-xl"
                >
                  <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e67e22]/10 text-[#e67e22] transition duration-300 group-hover:bg-[#e67e22] group-hover:text-white">
                    <Wrench size={30} />
                  </div>

                  <h3 className="text-2xl font-bold text-[#12345b]">
                    Worker
                  </h3>

                  <p className="mt-3 leading-6 text-[#526b86]">
                    Showcase your skills, connect with opportunities, and serve
                    customers through your cooperative.
                  </p>

                  <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#e67e22]">
                    Continue as Worker
                    <ArrowRight size={16} />
                  </div>
                </button>

                {/* Cooperative Owner */}
                <button
                  type="button"
                  onClick={() => handleRoleSelect("cooperative")}
                  className="group rounded-3xl border border-[#dce7ef] bg-white p-8 text-left shadow-lg shadow-[#12345b]/5 transition duration-300 hover:-translate-y-2 hover:border-[#12345b]/40 hover:shadow-xl"
                >
                  <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#12345b]/10 text-[#12345b] transition duration-300 group-hover:bg-[#12345b] group-hover:text-white">
                    <Building2 size={30} />
                  </div>

                  <h3 className="text-2xl font-bold text-[#12345b]">
                    Cooperative Owner
                  </h3>

                  <p className="mt-3 leading-6 text-[#526b86]">
                    Manage your cooperative and coordinate skilled workers
                    through Sahayog.
                  </p>

                  <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#12345b]">
                    Continue as Owner
                    <ArrowRight size={16} />
                  </div>
                </button>

              </div>

              <p className="mt-10 text-center text-sm text-[#526b86]">
                Your role will determine the login and registration options
                available to you.
              </p>
            </>
          )}

          {/* ================= LOGIN / REGISTER CHOICE ================= */}
          {selectedRole && !authMode && (
            <div className="mx-auto max-w-2xl">

              <button
                type="button"
                onClick={handleBackToRoles}
                className="mb-8 flex items-center gap-2 text-sm font-medium text-[#526b86] transition hover:text-[#16845f]"
              >
                <ArrowLeft size={17} />
                Change role
              </button>

              <div className="rounded-3xl border border-[#dce7ef] bg-white p-8 text-center shadow-xl shadow-[#12345b]/5 sm:p-12">

                <div
                  className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${roles[selectedRole].softColor}`}
                  style={{ color: roles[selectedRole].color }}
                >
                  {(() => {
                    const RoleIcon = roles[selectedRole].icon;
                    return <RoleIcon size={30} />;
                  })()}
                </div>

                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#16845f]">
                  {roles[selectedRole].title}
                </p>

                <h2 className="mt-3 text-3xl font-bold text-[#12345b] sm:text-4xl">
                  Welcome to Sahayog
                </h2>

                <p className="mx-auto mt-4 max-w-lg leading-7 text-[#526b86]">
                  {roles[selectedRole].description}
                </p>

                <div className="mt-10 grid gap-4 sm:grid-cols-2">

                  {/* Login */}
                  <button
                    type="button"
                    onClick={() => handleAuthModeSelect("login")}
                    className="group flex items-center justify-center gap-3 rounded-2xl border border-[#12345b]/15 bg-white px-6 py-4 font-semibold text-[#12345b] shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#12345b]/30 hover:bg-[#12345b] hover:text-white"
                  >
                    <LogIn size={19} />
                    Login
                  </button>

                  {/* Register */}
                  <button
                    type="button"
                    onClick={() => handleAuthModeSelect("register")}
                    className="group flex items-center justify-center gap-3 rounded-2xl bg-[#e67e22] px-6 py-4 font-semibold text-white shadow-lg shadow-[#e67e22]/20 transition duration-300 hover:-translate-y-1 hover:bg-[#d96f16]"
                  >
                    <UserPlus size={19} />
                    Register
                  </button>

                </div>
                <p className="mt-7 text-xs leading-5 text-[#526b86]">
                  Login or create your account to get started with Sahayog.
                </p>
              </div>
            </div>
          )}

          {/* ================= CUSTOMER REGISTRATION ================= */}
          {selectedRole === "customer" &&
            authMode === "register" && (
              <div className="mx-auto max-w-4xl">

                {/* Back to Login/Register */}
                <button
                  type="button"
                  onClick={handleBackToAuthChoice}
                  className="mb-8 flex items-center gap-2 text-sm font-medium text-[#526b86] transition hover:text-[#16845f]"
                >
                  <ArrowLeft size={17} />
                  Back to Login / Register
                </button>

                <div className="rounded-3xl border border-[#dce7ef] bg-white p-7 shadow-xl shadow-[#12345b]/5 sm:p-10">

                  {/* Form heading */}
                  <div className="mb-10">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#16845f]">
                      Customer Registration
                    </p>

                    <h2 className="mt-3 text-3xl font-bold text-[#12345b] sm:text-4xl">
                      Create your Sahayog account
                    </h2>

                    <p className="mt-3 max-w-2xl leading-7 text-[#526b86]">
                      Create your customer profile once. Your live location will be requested securely from the dashboard when you need a nearby service.
                    </p>
                  </div>

                  <form onSubmit={handleCustomerSubmit} aria-busy={Boolean(loadingActions.customerRegister)}>

                    {/* ================= PERSONAL DETAILS ================= */}
                    <section>
                      <h3 className="text-xl font-bold text-[#12345b]">
                        Personal Details
                      </h3>

                      <div className="mt-5 grid gap-5 md:grid-cols-2">

                        {/* Full Name */}
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            Full Name <span className="text-[#e67e22]">*</span>
                          </label>

                          <input
                            type="text"
                            name="fullName"
                            value={customerForm.fullName}
                            onChange={handleCustomerChange}
                            required
                            placeholder="Enter your full name"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                        {/* Email */}
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            Email <span className="text-[#e67e22]">*</span>
                          </label>

                          <input
                            type="email"
                            name="email"
                            value={customerForm.email}
                            onChange={handleCustomerChange}
                            required
                            placeholder="Enter your email"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                        {/* Phone Number */}
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            Phone Number{" "}
                            <span className="text-[#e67e22]">*</span>
                          </label>

                          <input
                            type="tel"
                            name="phoneNumber"
                            value={customerForm.phoneNumber}
                            onChange={handleCustomerChange}
                            required
                            placeholder="Enter your phone number"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                        {/* Password */}
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            Password <span className="text-[#e67e22]">*</span>
                          </label>

                          <input
                            type="password"
                            name="password"
                            value={customerForm.password}
                            onChange={handleCustomerChange}
                            required
                            placeholder="Create a password"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                        {/* Confirm Password */}
                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            Confirm Password{" "}
                            <span className="text-[#e67e22]">*</span>
                          </label>

                          <input
                            type="password"
                            name="confirmPassword"
                            value={customerForm.confirmPassword}
                            onChange={handleCustomerChange}
                            required
                            placeholder="Confirm your password"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                        {/* Profile Image */}
                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            Profile Image
                          </label>

                          <div className="rounded-2xl border border-dashed border-[#cbdbe5] bg-[#f8fbfd] p-5">
                            <input
                              type="file"
                              name="profileImage"
                              accept="image/*"
                              onChange={handleProfileImageChange}
                              className="block w-full text-sm text-[#526b86] file:mr-4 file:rounded-xl file:border-0 file:bg-[#16845f] file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-[#11704f]"
                            />

                            <p className="mt-2 text-xs text-[#526b86]">
                              Upload a clear profile photo. It will be securely stored with your account.
                            </p>

                            {profileImage && (
                              <p className="mt-3 text-xs font-medium text-[#16845f]">
                                Selected: {profileImage.name}
                              </p>
                            )}
                          </div>
                        </div>

                      </div>
                    </section>

                    {/* ================= ADDRESS ================= */}
                    <section className="mt-10 border-t border-[#e6edf1] pt-10">
                      <h3 className="text-xl font-bold text-[#12345b]">
                        Address
                      </h3>

                      <div className="mt-5 grid gap-5 md:grid-cols-2">

                        {/* House / Flat */}
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            House / Flat
                          </label>

                          <input
                            type="text"
                            name="houseFlat"
                            value={customerForm.houseFlat}
                            onChange={handleCustomerChange}
                            placeholder="House / Flat number"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                        {/* Area */}
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            Area <span className="text-[#e67e22]">*</span>
                          </label>

                          <input
                            type="text"
                            name="area"
                            value={customerForm.area}
                            onChange={handleCustomerChange}
                            required
                            placeholder="Enter your area"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                        {/* City */}
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            City <span className="text-[#e67e22]">*</span>
                          </label>

                          <input
                            type="text"
                            name="city"
                            value={customerForm.city}
                            onChange={handleCustomerChange}
                            required
                            placeholder="Enter your city"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                        {/* State */}
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            State <span className="text-[#e67e22]">*</span>
                          </label>

                          <input
                            type="text"
                            name="state"
                            value={customerForm.state}
                            onChange={handleCustomerChange}
                            required
                            placeholder="Enter your state"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                        {/* Pincode */}
                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                            Pincode <span className="text-[#e67e22]">*</span>
                          </label>

                          <input
                            type="text"
                            name="pincode"
                            value={customerForm.pincode}
                            onChange={handleCustomerChange}
                            required
                            inputMode="numeric"
                            placeholder="Enter your pincode"
                            className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                          />
                        </div>

                      </div>
                    </section>

                    {/* ================= SUBMIT ================= */}
                    <div className="mt-10 border-t border-[#e6edf1] pt-8">
                      <AuthSubmitButton loading={Boolean(loadingActions.customerRegister)} loadingText="Creating account..." icon={<UserPlus size={19} />} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#e67e22] px-6 py-4 font-semibold text-white shadow-lg shadow-[#e67e22]/20 transition duration-300 hover:-translate-y-1 hover:bg-[#d96f16]">
                        Create Customer Account
                      </AuthSubmitButton>

                      <p className="mt-4 text-center text-xs leading-5 text-[#526b86]">
                        By continuing, the entered information will be prepared
                        for submission to the Sahayog backend.
                      </p>
                    </div>

                  </form>
                </div>
              </div>
            )}

          {/* ================= CUSTOMER LOGIN ================= */}
          {selectedRole === "customer" && authMode === "login" && (
            <div className="mx-auto max-w-2xl">

              {/* Back to Login/Register choice */}
              <button
                type="button"
                onClick={handleBackToAuthChoice}
                className="mb-8 flex items-center gap-2 text-sm font-medium text-[#526b86] transition hover:text-[#16845f]"
              >
                <ArrowLeft size={17} />
                Back to Login / Register
              </button>

              <div className="rounded-3xl border border-[#dce7ef] bg-white p-8 shadow-xl shadow-[#12345b]/5 sm:p-12">

                {/* Login heading */}
                <div className="text-center">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#16845f]/10 text-[#16845f]">
                    <LogIn size={30} />
                  </div>

                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#16845f]">
                    Customer Login
                  </p>

                  <h2 className="mt-3 text-3xl font-bold text-[#12345b] sm:text-4xl">
                    Welcome back to Sahayog
                  </h2>

                  <p className="mx-auto mt-4 max-w-lg leading-7 text-[#526b86]">
                    Login to find trusted skilled workers and book services
                    for your household or community.
                  </p>
                </div>

                {/* ================= LOGIN FORM ================= */}
                <form
                  onSubmit={handleCustomerLoginSubmit}
                  aria-busy={Boolean(loadingActions.customerLogin)}
                  className="mt-10"
                >
                  {/* Email */}
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                      Email <span className="text-[#e67e22]">*</span>
                    </label>

                    <input
                      type="email"
                      name="email"
                      value={customerLogin.email}
                      onChange={handleCustomerLoginChange}
                      required
                      autoComplete="email"
                      placeholder="Enter your email"
                      className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                    />
                  </div>

                  {/* Password */}
                  <div className="mt-5">
                    <label className="mb-2 block text-sm font-semibold text-[#12345b]">
                      Password <span className="text-[#e67e22]">*</span>
                    </label>

                    <input
                      type="password"
                      name="password"
                      value={customerLogin.password}
                      onChange={handleCustomerLoginChange}
                      required
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="w-full rounded-xl border border-[#dce7ef] bg-[#f8fbfd] px-4 py-3 text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-2 focus:ring-[#16845f]/10"
                    />
                  </div>

                  {/* Login button */}
                  <AuthSubmitButton loading={Boolean(loadingActions.customerLogin)} loadingText="Signing in..." icon={<LogIn size={19} />} className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#e67e22] px-6 py-4 font-semibold text-white shadow-lg shadow-[#e67e22]/20 transition duration-300 hover:-translate-y-1 hover:bg-[#d96f16]">
                    Login as Customer
                  </AuthSubmitButton>

                  <p className="mt-4 text-center text-xs leading-5 text-[#526b86]">
                    Securely sign in to your Sahayog account.
                  </p>
                </form>
              </div>
            </div>
          )}

          {/* ================= WORKER / OTHER ROLE LOGIN ================= */}
          {selectedRole &&
            authMode === "login" &&
            selectedRole !== "customer" && (
              <div className="mx-auto max-w-2xl">
                <button
                  type="button"
                  onClick={handleBackToAuthChoice}
                  className="mb-8 flex items-center gap-2 text-sm font-medium text-[#526b86] transition hover:text-[#16845f]"
                >
                  <ArrowLeft size={17} />
                  Back to Login / Register
                </button>

                {selectedRole === "worker" ? (
                  <form
                    onSubmit={handleWorkerLoginSubmit}
                    aria-busy={Boolean(loadingActions.workerLogin)}
                    className="rounded-3xl border border-[#dce7ef] bg-white p-8 shadow-xl shadow-[#12345b]/5 sm:p-12"
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#e67e22]">
                      Worker
                    </p>

                    <h2 className="mt-3 text-3xl font-bold text-[#12345b]">
                      Welcome back
                    </h2>

                    <p className="mt-3 leading-7 text-[#526b86]">
                      Login to manage your services, profile and opportunities
                      on Sahayog.
                    </p>

                    <div className="mt-8 space-y-4">
                      <input
                        name="email"
                        type="email"
                        value={workerLogin.email}
                        onChange={handleWorkerLoginChange}
                        placeholder="Enter your email"
                        className="auth-input"
                      />

                      <input
                        name="password"
                        type="password"
                        value={workerLogin.password}
                        onChange={handleWorkerLoginChange}
                        placeholder="Enter your password"
                        className="auth-input"
                      />
                    </div>

                    <AuthSubmitButton loading={Boolean(loadingActions.workerLogin)} loadingText="Signing in..." icon={<LogIn size={19} />} className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#e67e22] px-6 py-4 font-semibold text-white shadow-lg shadow-[#e67e22]/20 transition duration-300 hover:-translate-y-1 hover:bg-[#d96f16]">
                      Login as Worker
                    </AuthSubmitButton>

                    <p className="mt-4 text-center text-xs leading-5 text-[#526b86]">
                      Securely sign in to your Sahayog account.
                    </p>
                  </form>
                ) : (
                  <form onSubmit={handleCooperativeLoginSubmit} aria-busy={Boolean(loadingActions.cooperativeLogin)} className="rounded-3xl border border-[#dce7ef] bg-white p-8 shadow-xl shadow-[#12345b]/5 sm:p-12">
                    <div className="text-center">
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#12345b]">Cooperative Owner</p>
                      <h2 className="mt-3 text-3xl font-bold text-[#12345b]">Welcome back</h2>
                      <p className="mt-3 leading-7 text-[#526b86]">Manage your cooperative, join requests and workers.</p>
                    </div>
                    <div className="mt-8 space-y-4">
                      <input name="email" type="email" value={cooperativeLogin.email} onChange={handleCooperativeLoginChange} placeholder="Admin email *" required className="auth-input" />
                      <input name="password" type="password" value={cooperativeLogin.password} onChange={handleCooperativeLoginChange} placeholder="Password *" required className="auth-input" />
                    </div>
                    <AuthSubmitButton loading={Boolean(loadingActions.cooperativeLogin)} loadingText="Signing in..." icon={<LogIn size={19} />} className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#12345b] px-6 py-4 font-semibold text-white shadow-lg transition hover:-translate-y-1 hover:bg-[#0d2948]">
                      Login as Cooperative Owner
                    </AuthSubmitButton>
                  </form>
                )}
              </div>
            )}

          {/* ================= WORKER / OTHER ROLE REGISTRATION ================= */}
          {selectedRole &&
            authMode === "register" &&
            selectedRole !== "customer" && (
              <div className="mx-auto max-w-3xl">
                <button
                  type="button"
                  onClick={handleBackToAuthChoice}
                  className="mb-8 flex items-center gap-2 text-sm font-medium text-[#526b86] transition hover:text-[#16845f]"
                >
                  <ArrowLeft size={17} />
                  Back to Login / Register
                </button>

                {selectedRole === "worker" ? (
                  <form
                    onSubmit={handleWorkerRegister}
                    aria-busy={Boolean(loadingActions.workerRegister)}
                    className="rounded-3xl border border-[#dce7ef] bg-white p-8 shadow-xl shadow-[#12345b]/5 sm:p-10"
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#e67e22]">
                      Worker Registration
                    </p>

                    <h2 className="mt-3 text-3xl font-bold text-[#12345b]">
                      Create your worker profile
                    </h2>

                    <p className="mt-3 leading-7 text-[#526b86]">
                      Build a professional profile, select every service you provide, and keep your live work location updated from the dashboard.
                    </p>

                    {/* Personal Details */}
                    <div className="mt-8">
                      <h3 className="text-lg font-bold text-[#12345b]">
                        Personal Details
                      </h3>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <input
                          name="fullName"
                          value={workerForm.fullName}
                          onChange={handleWorkerChange}
                          placeholder="Full Name *"
                          className="auth-input"
                        />

                        <input
                          name="email"
                          type="email"
                          value={workerForm.email}
                          onChange={handleWorkerChange}
                          placeholder="Email *"
                          className="auth-input"
                        />

                        <input
                          name="phoneNumber"
                          type="tel"
                          value={workerForm.phoneNumber}
                          onChange={handleWorkerChange}
                          placeholder="Phone Number *"
                          className="auth-input"
                        />

                        <input
                          name="password"
                          type="password"
                          value={workerForm.password}
                          onChange={handleWorkerChange}
                          placeholder="Password *"
                          className="auth-input"
                        />

                        <input
                          name="confirmPassword"
                          type="password"
                          value={workerForm.confirmPassword}
                          onChange={handleWorkerChange}
                          placeholder="Confirm Password *"
                          className="auth-input"
                        />
                      </div>

                      {/* Worker Profile Photo */}
                      <div className="mt-4 rounded-2xl border border-dashed border-[#b9dcca] bg-[#f8fbfd] p-5">
                        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#16845f]/20 bg-[#effaf4] text-[#16845f] ring-4 ring-[#effaf4]">
                            {workerForm.profilePreview ? (
                              <img
                                src={workerForm.profilePreview}
                                alt="Profile preview"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <UserRound size={34} />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-extrabold text-[#12345b]">Profile Photo</p>
                            <p className="mt-1 text-xs leading-5 text-[#526b86]">
                              Optional. This photo will be visible on your worker profile and to customers after assignment.
                            </p>
                            <p className="mt-2 text-xs font-semibold text-[#16845f]">
                              JPG, JPEG, PNG or WEBP • 100 KB–5 MB
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#16845f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#11704f]">
                                {workerForm.profileImage ? "Change Photo" : "Choose Photo"}
                                <input
                                  type="file"
                                  name="profilePhoto"
                                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                  onChange={handleWorkerProfileImage}
                                  className="sr-only"
                                />
                              </label>

                              {workerForm.profileImage && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setWorkerForm((prev) => ({
                                      ...prev,
                                      profileImage: null,
                                      profilePreview: "",
                                    }))
                                  }
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            {workerForm.profileImage && (
                              <p className="mt-2 truncate text-xs font-medium text-slate-500">
                                {workerForm.profileImage.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Address */}
                    <div className="mt-8">
                      <h3 className="text-lg font-bold text-[#12345b]">
                        Address
                      </h3>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <input
                          name="houseFlat"
                          value={workerForm.houseFlat}
                          onChange={handleWorkerChange}
                          placeholder="House / Flat"
                          className="auth-input"
                        />

                        <input
                          name="area"
                          value={workerForm.area}
                          onChange={handleWorkerChange}
                          placeholder="Area *"
                          className="auth-input"
                        />

                        <input
                          name="city"
                          value={workerForm.city}
                          onChange={handleWorkerChange}
                          placeholder="City *"
                          className="auth-input"
                        />

                        <input
                          name="state"
                          value={workerForm.state}
                          onChange={handleWorkerChange}
                          placeholder="State *"
                          className="auth-input"
                        />

                        <input
                          name="pincode"
                          value={workerForm.pincode}
                          onChange={handleWorkerChange}
                          placeholder="Pincode *"
                          className="auth-input"
                        />
                      </div>

                      <div className="mt-5 rounded-2xl border border-[#b9dcca] bg-[#effaf4] p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#16845f] shadow-sm">
                              <MapPin size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-extrabold text-[#12345b]">Registration location · Cooperative area</p>
                              <p className="mt-1 text-xs leading-5 text-[#526b86]">Detect your current area once during registration. This location helps Sahayog show cooperatives near your registration area. It is separate from your live dashboard location used for customer matching.</p>
                              {workerRegistrationLocationStatus && <p className="mt-2 text-xs font-bold text-[#16845f]">{workerRegistrationLocationStatus}</p>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleWorkerRegistrationLocation}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#16845f] px-4 py-3 text-xs font-extrabold text-white shadow-sm hover:bg-[#11704f]"
                          >
                            <MapPin size={15} />
                            {workerForm.registrationLatitude !== null ? "Refresh Area" : "Detect Registration Area"}
                          </button>
                        </div>
                        {workerForm.registrationLatitude !== null && (
                          <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#526b86]">
                            Registration coordinates captured ✓ · {workerForm.city || "Area"}, {workerForm.state || "State"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Services */}
                    <div className="mt-8">
                      <h3 className="text-lg font-bold text-[#12345b]">
                        Select Your Services
                      </h3>

                      <p className="mt-1 text-sm text-[#526b86]">
                        Select the services you provide.
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {[
                          "Plumbing",
                          "Electrical",
                          "Carpentry",
                          "Painting",
                          "Cleaning",
                        ].map((service) => {
                          const selected = Boolean(workerServices[service]);

                          return (
                            <button
                              key={service}
                              type="button"
                              onClick={() => toggleWorkerService(service)}
                              className={`flex items-center justify-between rounded-2xl border px-4 py-3.5 text-sm font-semibold transition ${
                                selected
                                  ? "border-[#16845f] bg-[#effaf4] text-[#16845f]"
                                  : "border-[#d7e3ec] bg-white text-[#526b86] hover:border-[#b9dcca]"
                              }`}
                            >
                              <span>{service}</span>
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                                  selected
                                    ? "bg-[#16845f] text-white"
                                    : "border border-[#cbd9e4]"
                                }`}
                              >
                                {selected ? "✓" : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Experience + Skill Level for each selected service */}
                      <div className="mt-4 space-y-4">
                        {Object.entries(workerServices).map(
                          ([service, details]) => (
                            <div
                              key={service}
                              className="rounded-2xl border border-[#dce8ef] bg-[#f8fbfd] p-5"
                            >
                              <div className="mb-4 flex items-center justify-between">
                                <h4 className="font-bold text-[#12345b]">
                                  {service}
                                </h4>

                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleWorkerService(service)
                                  }
                                  className="text-xs font-semibold text-[#e67e22] hover:underline"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="grid gap-4 sm:grid-cols-2">
                                <label>
                                  <span className="mb-2 block text-xs font-semibold text-[#526b86]">
                                    Experience (years)
                                  </span>

                                  <input
                                    type="number"
                                    min="0"
                                    value={details.experience}
                                    onChange={(event) =>
                                      updateWorkerService(
                                        service,
                                        "experience",
                                        event.target.value
                                      )
                                    }
                                    placeholder="e.g. 5"
                                    className="auth-input"
                                  />
                                </label>

                                <label>
                                  <span className="mb-2 block text-xs font-semibold text-[#526b86]">
                                    Skill Level
                                  </span>

                                  <select
                                    value={details.skillLevel}
                                    onChange={(event) =>
                                      updateWorkerService(
                                        service,
                                        "skillLevel",
                                        event.target.value
                                      )
                                    }
                                    className="auth-input"
                                  >
                                    <option value="BEGINNER">
                                      Beginner
                                    </option>
                                    <option value="INTERMEDIATE">
                                      Intermediate
                                    </option>
                                    <option value="EXPERT">
                                      Expert
                                    </option>
                                  </select>
                                </label>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    <AuthSubmitButton loading={Boolean(loadingActions.workerRegister)} loadingText="Creating worker account..." icon={<UserPlus size={19} />} className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#e67e22] px-6 py-4 font-semibold text-white shadow-lg shadow-[#e67e22]/20 transition duration-300 hover:-translate-y-1 hover:bg-[#d96f16]">
                      Register as Worker
                    </AuthSubmitButton>

                    {/* TODO BACKEND:
                        Connect this form to the worker registration API.
                        Map each selected service to serviceId,
                        experienceYears and skillLevel as required by
                        WorkerProfile. */}
                  </form>
                ) : (
                  <form onSubmit={handleCooperativeRegister} aria-busy={Boolean(loadingActions.cooperativeRegister)} className="rounded-3xl border border-[#dce7ef] bg-white p-8 shadow-xl shadow-[#12345b]/5 sm:p-10">
                    <div className="text-center">
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#12345b]">Cooperative Owner</p>
                      <h2 className="mt-3 text-3xl font-bold text-[#12345b]">Create your cooperative</h2>
                      <p className="mt-3 leading-7 text-[#526b86]">Register your cooperative and administrator in one organized, secure flow.</p>
                      <div className="mt-5 grid gap-2 sm:grid-cols-3">
                        {[['01','Cooperative'],['02','Administrator'],['03','Location']].map(([step,label]) => (
                          <div key={step} className="rounded-2xl border border-[#dce7ef] bg-[#f8fbfd] px-3 py-3 text-left">
                            <span className="text-xs font-black text-[#e67e22]">{step}</span>
                            <p className="mt-1 text-xs font-bold text-[#12345b]">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-8 grid gap-4 sm:grid-cols-2">
                      <input name="cooperativeName" value={cooperativeForm.cooperativeName} onChange={handleCooperativeChange} placeholder="Cooperative name *" required className="auth-input" />
                      <input name="registrationNumber" value={cooperativeForm.registrationNumber} onChange={handleCooperativeChange} placeholder="Registration number *" required className="auth-input" />
                      <input name="cooperativeEmail" type="email" value={cooperativeForm.cooperativeEmail} onChange={handleCooperativeChange} placeholder="Cooperative email *" required className="auth-input" />
                      <input name="cooperativePhone" value={cooperativeForm.cooperativePhone} onChange={handleCooperativeChange} placeholder="Cooperative phone *" required className="auth-input" />
                    </div>
                    <textarea name="description" value={cooperativeForm.description} onChange={handleCooperativeChange} placeholder="Cooperative description" rows="3" className="auth-input mt-4" />

                    <h3 className="mt-8 text-lg font-bold text-[#12345b]">Administrator</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <input name="adminFullName" value={cooperativeForm.adminFullName} onChange={handleCooperativeChange} placeholder="Admin full name *" required className="auth-input" />
                      <input name="adminEmail" type="email" value={cooperativeForm.adminEmail} onChange={handleCooperativeChange} placeholder="Admin email *" required className="auth-input" />
                      <input name="adminPhone" value={cooperativeForm.adminPhone} onChange={handleCooperativeChange} placeholder="Admin phone *" required className="auth-input" />
                      <input name="password" type="password" value={cooperativeForm.password} onChange={handleCooperativeChange} placeholder="Password *" required className="auth-input" />
                      <input name="confirmPassword" type="password" value={cooperativeForm.confirmPassword} onChange={handleCooperativeChange} placeholder="Confirm password *" required className="auth-input" />
                      <label className="sm:col-span-2">
                        <span className="mb-2 block text-sm font-semibold text-[#12345b]">Owner Profile Photo</span>
                        <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={(event) => setCooperativeProfileImage(event.target.files?.[0] || null)} className="block w-full rounded-xl border border-dashed border-[#cbdbe5] bg-[#f8fbfd] p-3 text-sm text-[#526b86] file:mr-4 file:rounded-lg file:border-0 file:bg-[#12345b] file:px-4 file:py-2 file:font-semibold file:text-white" />
                        {cooperativeProfileImage && <span className="mt-2 block text-xs font-semibold text-[#16845f]">Selected: {cooperativeProfileImage.name}</span>}
                      </label>
                    </div>

                    <h3 className="mt-8 text-lg font-bold text-[#12345b]">Cooperative address</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <input name="house" value={cooperativeForm.house} onChange={handleCooperativeChange} placeholder="House / building" className="auth-input" />
                      <input name="area" value={cooperativeForm.area} onChange={handleCooperativeChange} placeholder="Area *" required className="auth-input" />
                      <input name="city" value={cooperativeForm.city} onChange={handleCooperativeChange} placeholder="City *" required className="auth-input" />
                      <input name="state" value={cooperativeForm.state} onChange={handleCooperativeChange} placeholder="State *" required className="auth-input" />
                      <input name="pincode" value={cooperativeForm.pincode} onChange={handleCooperativeChange} placeholder="Pincode *" required className="auth-input" />
                    </div>
                    <button type="button" onClick={handleCooperativeLocation} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#16845f]/30 px-4 py-3 text-sm font-bold text-[#16845f] hover:bg-[#16845f]/5"><MapPin size={17} /> Use Current Location</button>
                    {cooperativeLocationStatus && <p className="mt-3 text-sm text-[#526b86]">{cooperativeLocationStatus}</p>}
                    <AuthSubmitButton loading={Boolean(loadingActions.cooperativeRegister)} loadingText="Creating cooperative account..." icon={<UserPlus size={19} />} className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#12345b] px-6 py-4 font-semibold text-white shadow-lg transition hover:-translate-y-1 hover:bg-[#0d2948]">
                      Register Cooperative
                    </AuthSubmitButton>
                  </form>
                )}
              </div>
            )}



        </div>
      </main>

      <AnimatePresence>
        {registrationSuccess && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="w-full max-w-md rounded-[2rem] bg-white p-8 text-center shadow-2xl"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 16 }}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-[#16845f] ring-8 ring-emerald-50/70"
              >
                <motion.svg width="42" height="42" viewBox="0 0 42 42" fill="none" aria-hidden="true">
                  <motion.path
                    d="M10 22.5 17.5 30 32 13.5"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.3, duration: 0.55, ease: "easeOut" }}
                  />
                </motion.svg>
              </motion.div>
              <h2 className="mt-6 text-2xl font-black text-[#12345b]">{registrationSuccess.title}</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">{registrationSuccess.message}</p>
              <button type="button" onClick={closeRegistrationSuccess} className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-[#16845f] px-5 py-3.5 font-extrabold text-white transition hover:bg-[#11704f]">Continue to Login</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AuthPage;
