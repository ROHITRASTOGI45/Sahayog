import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ChevronDown,
  Droplets,
  LoaderCircle,
  LogOut,
  Star,
  AlertTriangle,
  KeyRound,
  MapPin,
  Paintbrush,
  RefreshCw,
  Scissors,
  Search,
  Sparkles,
  Wrench,
  XCircle,
  Zap,
  Heart,
  UserRound,
  HelpCircle,
  ClipboardList,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { api } from "../lib/api";
import logo from "../assets/logo.png";
import ProfileAvatar from "../components/ProfileAvatar";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  "http://localhost:5000";

const CANCELLABLE_STATUSES = [
  "REQUESTED",
  "ASSIGNED",
];

const isActiveRequest = (request) =>
  request &&
  !["COMPLETED", "CANCELLED"].includes(request.status);

const isVisibleInRequestActivity = (request) =>
  isActiveRequest(request) ||
  (request.status === "COMPLETED" && !request.rating);

const SERVICES = [
  {
    name: "Plumbing",
    icon: Droplets,
    description:
      "Pipes, taps, leaks & fittings",
  },
  {
    name: "Electrical",
    icon: Zap,
    description:
      "Wiring, switches & appliances",
  },
  {
    name: "Carpentry",
    icon: Scissors,
    description:
      "Furniture, doors & woodwork",
  },
  {
    name: "Painting",
    icon: Paintbrush,
    description:
      "Walls, rooms & finishing",
  },
  {
    name: "Cleaning",
    icon: Sparkles,
    description:
      "Home & sanitation services",
  },
];

const getCurrentLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          "Geolocation is not supported by this browser."
        )
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const {
          latitude,
          longitude,
          accuracy,
        } = position.coords;

        console.log("GPS POSITION:");
        console.log("Latitude:", latitude);
        console.log("Longitude:", longitude);
        console.log(
          "Accuracy:",
          accuracy,
          "meters"
        );

        if (accuracy > 10000) {
          reject(
            new Error(
              `Location is too inaccurate (${Math.round(
                accuracy
              )} meters). Please enable precise location and try again.`
            )
          );

          return;
        }

        resolve({
          latitude,
          longitude,
          accuracy,
        });
      },

      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(
              new Error(
                "Location permission denied. Please allow location access."
              )
            );
            break;

          case error.POSITION_UNAVAILABLE:
            reject(
              new Error(
                "Location unavailable. Please check your device location settings."
              )
            );
            break;

          case error.TIMEOUT:
            reject(
              new Error(
                "Location request timed out. Please try again."
              )
            );
            break;

          default:
            reject(
              new Error(
                "Unable to detect your location."
              )
            );
        }
      },

      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      }
    );
  });

const normalizeJob = (job) => {
  if (!job) return null;

  return {
    ...job,
    id: String(job.id || job._id),
    location:
      job.location || {
        formatted: "Location unavailable",
      },
    assignedWorker:
      job.assignedWorker || null,
  };
};

const statusMeta = {
  REQUESTED: {
    label: "Finding a professional",
    icon: Search,
  },

  ASSIGNED: {
    label:
      "Request fulfilled — professional assigned",
    icon: CheckCircle2,
  },

  IN_PROGRESS: {
    label: "Service in progress",
    icon: Wrench,
  },

  WORK_COMPLETION_REQUESTED: {
    label: "Completion confirmation needed",
    icon: Clock3,
  },

  CUSTOMER_DISPUTED: {
    label: "Problem reported",
    icon: AlertTriangle,
  },

  COMPLETED: {
    label: "Service completed",
    icon: CheckCircle2,
  },

  CANCELLED: {
    label: "Request cancelled",
    icon: XCircle,
  },
};

const statusRank = {
  REQUESTED: 1,
  ASSIGNED: 2,
  IN_PROGRESS: 3,
  WORK_COMPLETION_REQUESTED: 4,
  CUSTOMER_DISPUTED: 4.5,
  COMPLETED: 5,
  CANCELLED: 5,
};

const mergeJobs = (previous = [], incoming = []) => {
  // Keep every request as an independent item. API refreshes and socket
  // events can arrive in either order, so merge by the unique request id
  // instead of replacing the collection with the latest payload.
  const byId = new Map();

  const addJob = (rawJob) => {
    const job = normalizeJob(rawJob);
    if (!job?.id) return;

    const key = String(job.id);
    const existing = byId.get(key);

    if (!existing) {
      byId.set(key, job);
      return;
    }

    const oldRank = statusRank[existing.status] || 0;
    const newRank = statusRank[job.status] || 0;
    const newerStatus = newRank >= oldRank ? job.status : existing.status;

    byId.set(key, {
      ...existing,
      ...job,
      status: newerStatus,
      assignedWorker:
        job.assignedWorker ||
        existing.assignedWorker ||
        null,
    });
  };

  previous.forEach(addJob);
  incoming.forEach(addJob);

  return Array.from(byId.values()).sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });
};

export default function CustomerDashboard({
  customer,
  onLogout,
}) {
  const [selectedService, setSelectedService] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [experiencePreference, setExperiencePreference] =
    useState("ANY");

  const [amount, setAmount] =
    useState("499");

  const [location, setLocation] =
    useState(null);

  const [locationStatus, setLocationStatus] =
    useState("Detecting your location...");

  const [locationLoading, setLocationLoading] =
    useState(false);

  const [locationPopupOpen, setLocationPopupOpen] =
    useState(false);

  const [requestStatus, setRequestStatus] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [requests, setRequests] =
    useState([]);

  const [socketConnected, setSocketConnected] =
    useState(false);

  const [completionCode, setCompletionCode] = useState(null);
  const [completionBusyId, setCompletionBusyId] = useState(null);
  const [disputeJob, setDisputeJob] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [ratingJob, setRatingJob] = useState(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingReview, setRatingReview] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [savedProfessionals, setSavedProfessionals] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [selectedWorkerProfile, setSelectedWorkerProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [directRequestWorker, setDirectRequestWorker] = useState(null);
  const [directRequestOpen, setDirectRequestOpen] = useState(false);
  const [directRequestService, setDirectRequestService] = useState("");
  const [directRequestDescription, setDirectRequestDescription] = useState("");
  const [directRequestAmount, setDirectRequestAmount] = useState("499");
  const [directRequestSubmitting, setDirectRequestSubmitting] = useState(false);
  const [acceptedWorkerPopup, setAcceptedWorkerPopup] = useState(null);
  const [hiddenUntilAcceptanceConfirmed, setHiddenUntilAcceptanceConfirmed] = useState(() => new Set());

  const locationPopupRef = useRef(null);

  const selectedServiceDetails = useMemo(
    () =>
      SERVICES.find(
        (service) =>
          service.name === selectedService
      ),
    [selectedService]
  );

  const amountBounds = experiencePreference === "EXPERIENCED"
    ? { min: 599, max: 5999 }
    : { min: 499, max: 4999 };

  const loadSavedProfessionals = useCallback(async () => {
    setSavedLoading(true);
    try {
      const response = await api("/customers/saved-professionals");
      setSavedProfessionals(response.professionals || []);
    } catch (error) {
      setRequestStatus(error.message || "Unable to load saved professionals.");
    } finally {
      setSavedLoading(false);
    }
  }, []);

  const toggleSavedProfessional = async (workerId, saved) => {
    if (!workerId) return;
    try {
      if (saved) {
        await api(`/customers/saved-professionals/${workerId}`, { method: "DELETE" });
        setSavedProfessionals((items) => items.filter((item) => String(item._id) !== String(workerId)));
      } else {
        await api(`/customers/saved-professionals/${workerId}`, { method: "POST" });
        await loadSavedProfessionals();
      }
    } catch (error) {
      setRequestStatus(error.message || "Unable to update saved professionals.");
    }
  };

  const getWorkerServices = (worker) => {
    const services = [
      ...(Array.isArray(worker?.skills) ? worker.skills.map((skill) => skill?.service).filter(Boolean) : []),
      worker?.service,
    ];
    return [...new Set(services.map((service) => String(service).trim()).filter(Boolean))];
  };

  const openWorkerProfile = useCallback(async (worker, requestService = "") => {
    const workerId = worker?.id || worker?._id;
    if (!workerId) {
      setProfileError("Professional information is unavailable.");
      setSelectedWorkerProfile({ ...(worker || {}), requestedService: requestService });
      return;
    }

    setProfileError("");
    setProfileLoading(true);
    setSelectedWorkerProfile({ ...(worker || {}), requestedService: requestService });

    try {
      const response = await api(`/customers/professionals/${workerId}/profile`);
      const professional = response?.professional;

      if (!professional) {
        throw new Error("Professional profile data was not returned.");
      }

      setSelectedWorkerProfile({
        ...professional,
        requestedService: requestService || professional.requestedService || "",
      });
    } catch (error) {
      console.error("Failed to load professional profile:", error);
      setProfileError(error?.message || "Unable to load professional profile. Please try again.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const closeWorkerProfile = () => {
    if (profileLoading) return;
    setSelectedWorkerProfile(null);
    setProfileError("");
  };

  const openDirectRequest = (worker) => {
    const services = getWorkerServices(worker);
    setDirectRequestWorker(worker);
    setDirectRequestService(services[0] || "");
    setDirectRequestDescription("");
    setDirectRequestAmount("499");
    setDirectRequestOpen(true);
  };

  const closeDirectRequest = (force = false) => {
    if (directRequestSubmitting && !force) return;
    setDirectRequestOpen(false);
    setDirectRequestWorker(null);
    setDirectRequestService("");
    setDirectRequestDescription("");
    setDirectRequestAmount("499");
  };

  const submitDirectRequest = async (event) => {
    event.preventDefault();
    if (!directRequestWorker?._id) return;

    if (String(directRequestWorker.status || "").toUpperCase() !== "AVAILABLE") {
      setRequestStatus("Worker not available. Please try again when this professional is available.");
      return;
    }

    if (!directRequestService) {
      setRequestStatus("Please select a service.");
      return;
    }

    const cleanDescription = directRequestDescription.trim();
    const numericAmount = Number(directRequestAmount);
    if (!Number.isInteger(numericAmount) || numericAmount < 499 || numericAmount > 4999) {
      setRequestStatus("Amount must be between ₹499 and ₹4999.");
      return;
    }
    if (cleanDescription.length < 3 || cleanDescription.length > 2000) {
      setRequestStatus("Description must be between 3 and 2000 characters.");
      return;
    }

    setDirectRequestSubmitting(true);
    setRequestStatus("Checking professional availability...");

    try {
      const currentLocation = location;
      if (!currentLocation?.latitude || !currentLocation?.longitude) {
        setRequestStatus("Please allow location access from the navbar before requesting a professional.");
        return;
      }
      const response = await api("/jobs/create", {
        method: "POST",
        body: JSON.stringify({
          service: directRequestService,
          description: cleanDescription,
          experiencePreference: "ANY",
          amount: numericAmount,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          locationAddress: currentLocation.address,
          preferredWorkerId: directRequestWorker._id,
        }),
      });

      const created = normalizeJob(response.job);
      if (created) {
        setRequests((current) => [
          created,
          ...current.filter((item) => String(item.id) !== String(created.id)),
        ]);
      }

      setRequestStatus(`Request sent only to ${directRequestWorker.fullName}.`);
      closeDirectRequest(true);
      await loadRequests();
    } catch (error) {
      const message = error?.message || "Unable to send request.";
      setRequestStatus(message);
    } finally {
      setDirectRequestSubmitting(false);
    }
  };

  /*
   * ==========================================
   * LOCATION
   * ==========================================
   */

  const fetchLocation = useCallback(
    async () => {
      setLocationLoading(true);

      setLocationStatus(
        "Detecting your location..."
      );

      try {
        const coordinates =
          await getCurrentLocation();

        let address;

        try {
          const response = await api(
            "/location/reverse-geocode",
            {
              method: "POST",
              body: JSON.stringify(
                coordinates
              ),
            }
          );

          address =
            response.data?.address ||
            response.address || {
              formatted:
                "Location detected",
            };

          if (!address?.formatted) {
            throw new Error(
              "Reverse geocoding returned no address."
            );
          }
        } catch (error) {
          setLocation(null);

          setLocationStatus(
            "Unable to determine your service address."
          );

          throw new Error(
            messageForLocationError(
              error
            )
          );
        }

        const currentLocation = {
          ...coordinates,
          address,
        };

        setLocation(
          currentLocation
        );

        setLocationStatus(
          address.formatted
        );

        return currentLocation;
      } catch (error) {
        if (
          !String(
            error?.message || ""
          )
            .toLowerCase()
            .includes("authentication")
        ) {
          setLocation(null);
        }

        setLocationStatus(
          error?.message ||
            "Unable to detect your location. Please try again."
        );

        throw error;
      } finally {
        setLocationLoading(false);
      }
    },
    []
  );

  /*
   * ==========================================
   * LOAD REQUESTS
   * ==========================================
   */

  const loadRequests = useCallback(
    async () => {
      try {
        const response =
          await api("/jobs/mine");

        // `/jobs/mine` is the authoritative full request-history response.
        // Normalize it as an array and merge it with any socket-created
        // request so no request disappears when another request is created.
        const incoming = Array.isArray(response.jobs)
          ? response.jobs.map(normalizeJob).filter(Boolean)
          : [];

        setRequests((previous) => mergeJobs(previous, incoming));

        return incoming;
      } catch (error) {
        if (
          error?.message ===
            "Customer access required" ||
          /unauthorized|expired/i.test(
            error?.message || ""
          )
        ) {
          setRequestStatus(
            "Customer authentication expired. Please log in again."
          );
        }

        return null;
      }
    },
    []
  );

  /*
   * ==========================================
   * INITIAL DASHBOARD LOAD
   * ==========================================
   */

  useEffect(() => {
    fetchLocation().catch(() => {});

    loadRequests();
    loadSavedProfessionals();

    const polling =
      window.setInterval(() => {
        loadRequests();
      }, 5000);

    if (!window.io) {
      return () =>
        window.clearInterval(
          polling
        );
    }

    const socket = window.io(
      SOCKET_URL,
      {
        withCredentials: true,
        transports: [
          "websocket",
          "polling",
        ],
        auth: {
          role: "CUSTOMER",
        },
      }
    );

    socket.on("connect", () => {
      setSocketConnected(true);

      loadRequests();
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    socket.on(
      "worker-accepted",
      (payload) => {
        const requestId =
          payload?.requestId;

        if (!requestId) return;

        const worker =
          payload.worker || null;

        setHiddenUntilAcceptanceConfirmed((current) => {
          const next = new Set(current);
          next.add(String(requestId));
          return next;
        });

        setAcceptedWorkerPopup({
          requestId: String(requestId),
          service: payload.service || "Service",
          worker,
        });

        setRequests((current) => {
          const exists =
            current.some(
              (request) =>
                String(request.id) ===
                String(requestId)
            );

          if (!exists) {
            return [
              {
                id: String(requestId),

                service:
                  payload.service ||
                  "Service",

                description:
                  payload.description ||
                  "",

                status: "ASSIGNED",

                location:
                  payload.location || {
                    formatted:
                      "Location unavailable",
                  },

                assignedWorker:
                  worker,
              },

              ...current,
            ];
          }

          return current.map(
            (request) =>
              String(request.id) ===
              String(requestId)
                ? {
                    ...request,

                    status:
                      "ASSIGNED",

                    assignedWorker:
                      worker ||
                      request.assignedWorker ||
                      null,

                    location:
                      payload.location ||
                      request.location,
                  }
                : request
          );
        });

        setRequestStatus(
          "Request fulfilled — professional assigned."
        );
        loadRequests();
      }
    );

    socket.on(
      "request-cancelled",
      (payload) => {
        const requestId =
          payload?.requestId;

        if (!requestId) return;

        setRequests((current) =>
          current.map((request) =>
            String(request.id) ===
            String(requestId)
              ? {
                  ...request,

                  status:
                    "CANCELLED",

                  assignedWorker:
                    null,
                }
              : request
          )
        );
      }
    );

    socket.on(
      "job-completion-requested",
      (payload) => {
        const requestId = payload?.requestId;
        if (!requestId) return;

        setRequests((current) =>
          current.map((request) =>
            String(request.id) === String(requestId)
              ? {
                  ...request,
                  status: "WORK_COMPLETION_REQUESTED",
                  assignedWorker:
                    payload.worker || request.assignedWorker || null,
                  completion: {
                    ...(request.completion || {}),
                    requestedAt:
                      payload.requestedAt || new Date().toISOString(),
                  },
                }
              : request
          )
        );

        setRequestStatus(
          "Your professional has requested completion confirmation."
        );
      }
    );

    socket.on(
      "job-status-updated",
      (payload) => {
        const requestId =
          payload?.requestId;

        if (!requestId) return;

        setRequests((current) =>
          current.map((request) =>
            String(request.id) ===
            String(requestId)
              ? {
                  ...request,

                  status:
                    payload.status ||
                    request.status,

                  assignedWorker:
                    payload.worker ||
                    request.assignedWorker ||
                    null,
                }
              : request
          )
        );
      }
    );

    return () => {
      window.clearInterval(
        polling
      );

      socket.disconnect();
    };
  }, [
    fetchLocation,
    loadRequests,
    loadSavedProfessionals,
  ]);

  const confirmWorkerFoundPopup = () => {
    if (!acceptedWorkerPopup?.requestId) return;
    const requestId = acceptedWorkerPopup.requestId;
    setHiddenUntilAcceptanceConfirmed((current) => {
      const next = new Set(current);
      next.delete(String(requestId));
      return next;
    });
    setAcceptedWorkerPopup(null);
    setRequestStatus("Professional assigned successfully.");
  };

  /*
   * ==========================================
   * CLOSE LOCATION POPUP WHEN CLICKING OUTSIDE
   * ==========================================
   */

  useEffect(() => {
    const handleOutsideClick = (
      event
    ) => {
      if (
        locationPopupRef.current &&
        !locationPopupRef.current.contains(
          event.target
        )
      ) {
        setLocationPopupOpen(false);
      }
    };

    if (locationPopupOpen) {
      document.addEventListener(
        "mousedown",
        handleOutsideClick
      );
    }

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, [locationPopupOpen]);

  /*
   * ==========================================
   * VERIFIED COMPLETION + RATING
   * ==========================================
   */

  const confirmCompletion = async (request) => {
    setCompletionBusyId(request.id);
    try {
      const response = await api(`/jobs/${request.id}/confirm-completion`, { method: "POST" });
      setCompletionCode({ jobId: String(request.id), otp: response.otp, expiresAt: response.expiresAt });
      setRequests((current) => current.map((item) => String(item.id) === String(request.id)
        ? { ...item, completion: { ...(item.completion || {}), customerConfirmedAt: new Date().toISOString() } }
        : item));
      setRequestStatus("Completion confirmed. Give the verification code to the professional.");
    } catch (error) {
      setRequestStatus(error?.message || "Unable to confirm completion.");
    } finally {
      setCompletionBusyId(null);
    }
  };

  const reportCompletionProblem = async () => {
    if (!disputeJob) return;
    const reason = disputeReason.trim();
    if (reason.length < 3) {
      setRequestStatus("Please describe the problem before reporting it.");
      return;
    }

    setCompletionBusyId(disputeJob.id);
    try {
      const response = await api(`/jobs/${disputeJob.id}/dispute-completion`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setRequests((current) => current.map((item) => String(item.id) === String(disputeJob.id)
        ? { ...item, ...(normalizeJob(response.job) || {}), status: "CUSTOMER_DISPUTED" }
        : item));
      setCompletionCode(null);
      setDisputeJob(null);
      setDisputeReason("");
      setRequestStatus("Problem reported. The service will not be marked completed.");
    } catch (error) {
      setRequestStatus(error?.message || "Unable to report the problem.");
    } finally {
      setCompletionBusyId(null);
    }
  };

  const submitRating = async () => {
    if (!ratingJob || !ratingValue) {
      setRequestStatus("Please select a rating from 1 to 5 stars.");
      return;
    }
    setRatingSubmitting(true);
    try {
      const response = await api(`/jobs/${ratingJob.id}/rating`, {
        method: "POST",
        body: JSON.stringify({ rating: ratingValue, review: ratingReview.trim() }),
      });
      setRequests((current) => current.map((item) => String(item.id) === String(ratingJob.id)
        ? { ...item, rating: response.rating || { rating: ratingValue, review: ratingReview.trim() } }
        : item));

      // If the professional profile is currently open for this worker,
      // refresh it immediately so the new comment/rating appears without
      // requiring a page reload or reopening stale state.
      const ratedWorkerId = ratingJob.assignedWorker?.id || ratingJob.assignedWorker?._id;
      if (selectedWorkerProfile && ratedWorkerId) {
        const profileWorkerId = selectedWorkerProfile.id || selectedWorkerProfile._id;
        if (String(profileWorkerId) === String(ratedWorkerId)) {
          await openWorkerProfile(selectedWorkerProfile, selectedWorkerProfile.requestedService || ratingJob.service || "");
        }
      }

      setRatingJob(null);
      setRatingValue(0);
      setRatingReview("");
      setRequestStatus("Thank you. Your rating has been submitted.");
    } catch (error) {
      setRequestStatus(error?.message || "Unable to submit your rating.");
    } finally {
      setRatingSubmitting(false);
    }
  };

  /*
   * ==========================================
   * SUBMIT SERVICE REQUEST
   * ==========================================
   */

  const submit = async (event) => {
    event.preventDefault();

    if (!customer) {
      setRequestStatus(
        "Customer access required. Please log in again."
      );

      return;
    }

    if (!selectedService) {
      setRequestStatus(
        "Please select a service."
      );

      return;
    }

    const cleanDescription =
      description.trim();
    const numericAmount = Number(amount);
    if (!Number.isInteger(numericAmount) || numericAmount < amountBounds.min || numericAmount > amountBounds.max) {
      setRequestStatus(`Amount must be between ₹${amountBounds.min} and ₹${amountBounds.max}.`);
      return;
    }

    if (
      cleanDescription.length < 3
    ) {
      setRequestStatus(
        "Please describe the problem."
      );

      return;
    }

    setSubmitting(true);

    setRequestStatus(
      "Using your dashboard location..."
    );

    try {
      // Use the same location shown in the dashboard navbar.
      // The customer can refresh that location from the navbar before creating a request.
      const currentLocation = location;
      if (!currentLocation?.latitude || !currentLocation?.longitude) {
        setSubmitting(false);
        setRequestStatus("Please allow location access from the navbar before requesting a service.");
        return;
      }

      setRequestStatus(
        "Finding professionals nearby..."
      );

      const response = await api(
        "/jobs/create",
        {
          method: "POST",

          body: JSON.stringify({
            service:
              selectedService,

            description:
              cleanDescription,

            experiencePreference,

            amount: numericAmount,

            latitude:
              currentLocation.latitude,

            longitude:
              currentLocation.longitude,

            locationAddress:
              currentLocation.address,
          }),
        }
      );

      const created =
        normalizeJob(
          response.job
        );

      setRequests((current) => {
        const withoutDuplicate =
          current.filter(
            (request) =>
              String(request.id) !==
              String(created.id)
          );

        return [
          created,
          ...withoutDuplicate,
        ];
      });

      setRequestStatus(
        response.workerCount
          ? "Request sent to nearby professionals. Waiting for the first professional to accept."
          : "No available professionals are within 10 km right now."
      );

      setSelectedService("");

      setDescription("");
      setExperiencePreference("ANY");
      setAmount("499");

      await loadRequests();
    } catch (error) {
      const message =
        error?.message || "";

      if (
        /customer access|required|unauthorized|invalid or expired access token/i.test(
          message
        )
      ) {
        setRequestStatus(
          "Customer authentication expired. Please log in again."
        );
      } else if (
        /location|address|geocod|permission|detect/i.test(
          message
        )
      ) {
        setRequestStatus(
          message
        );
      } else {
        setRequestStatus(
          message ||
            "Unable to send your request. Please try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * ==========================================
   * CANCEL REQUEST
   * ==========================================
   */

  const cancelRequest =
    async (requestId) => {
      if (!requestId) return;

      try {
        await api(
          `/jobs/${requestId}/cancel`,
          {
            method: "PATCH",
          }
        );

        setRequests((current) =>
          current.map((request) =>
            String(request.id) === String(requestId)
              ? { ...request, status: "CANCELLED", assignedWorker: null }
              : request
          )
        );

        setRequestStatus(
          "Service request cancelled."
        );
      } catch (error) {
        setRequestStatus(
          error?.message ||
            "Unable to cancel this request."
        );
      }
    };

  /*
   * ==========================================
   * CUSTOMER DISPLAY NAME
   * ==========================================
   */

  const customerName =
    customer?.fullname ||
    customer?.fullName ||
    "Customer";

  /*
   * ==========================================
   * NAVBAR LOCATION TEXT
   * ==========================================
   */

  const navbarLocation =
    location?.address?.formatted ||
    locationStatus ||
    "Detecting your location...";

  return (
    <main className="min-h-screen bg-[#f6faf8] text-[#173b32]" style={{ "--sidebar-space": sidebarOpen ? "16rem" : "5rem" }}>
      <aside className={`fixed left-0 top-0 z-30 hidden h-screen border-r border-[#dcebe4] bg-white p-4 transition-[width] duration-200 lg:block ${sidebarOpen ? "w-64" : "w-20"}`}>
        <div className={`flex items-center border-b border-slate-100 pb-5 ${sidebarOpen ? "justify-between gap-3" : "justify-center"}`}>
          {sidebarOpen && <div className="flex items-center gap-3"><img src={logo} alt="Sahayog" className="h-10 w-10" /><div><p className="font-black text-[#12345b]">Sahayog</p><p className="text-xs text-slate-500">Customer</p></div></div>}
          <button type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#fff3e8] hover:text-[#e67e22]"><span className="sr-only">{sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}</span>{sidebarOpen ? <PanelLeftClose size={19}/> : <PanelLeftOpen size={19}/>}</button>
        </div>
        <nav className="mt-6 space-y-2">
          {[
            ["dashboard", "Find a Service", Search],
            ["activity", "Request Activity", ClipboardList],
            ["saved", "Saved Professionals", Heart],
            ["profile", "Profile & Settings", UserRound],
            ["help", "Help & Support", HelpCircle],
          ].map(([key, label, Icon]) => <button key={key} type="button" onClick={() => { setSidebarPanel(key); if (key === "saved") loadSavedProfessionals(); window.scrollTo({ top: 0, behavior: "smooth" }); }} title={!sidebarOpen ? label : undefined} className={`flex w-full items-center rounded-xl py-3 text-sm font-extrabold transition ${sidebarOpen ? "gap-3 px-4" : "justify-center px-2"} ${sidebarPanel === key ? "border border-[#f2c49e] bg-[#fff3e8] text-[#e67e22]" : "text-slate-600 hover:bg-[#fff3e8] hover:text-[#cf6814]"}`}><Icon size={18}/>{sidebarOpen && <span>{label}</span>}</button>)}
        </nav>
      </aside>

      <div className="fixed left-0 top-0 z-40 flex w-full items-center justify-between border-b border-[#dcebe4] bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2"><Menu size={20} className="text-[#16845f]"/><span className="font-black text-[#12345b]">Customer Menu</span></div>
        <select value={sidebarPanel} onChange={(e) => { setSidebarPanel(e.target.value); if (e.target.value === "saved") loadSavedProfessionals(); }} className="rounded-lg border border-slate-200 px-2 py-2 text-sm font-bold">
          <option value="dashboard">Find a Service</option><option value="activity">Request Activity</option><option value="saved">Saved Professionals</option><option value="profile">Profile & Settings</option><option value="help">Help & Support</option>
        </select>
      </div>

      {/* =====================================
          NAVBAR
      ===================================== */}

      <div className="border-b border-[#dcebe4] bg-white">

        <div className="mx-auto flex max-w-7xl items-center lg:pl-[var(--sidebar-space)] gap-3 px-4 py-4 sm:px-6 lg:px-8">


          
          {/* RIGHT SIDE NAVBAR */}

          <div className="flex w-full min-w-0 items-center justify-between gap-4 sm:gap-6">

            {/* =================================
                LOCATION BUTTON + POPUP
            ================================= */}

            <div
              ref={locationPopupRef}
              className="relative min-w-0 shrink"
            >

              {/* LOCATION NAVBAR BUTTON */}

              <button
                type="button"
                onClick={() =>
                  setLocationPopupOpen(
                    (current) =>
                      !current
                  )
                }
                title="View your full location"
                className="group flex min-w-0 max-w-[170px] items-center gap-2 rounded-xl border border-[#dcebe4] bg-white px-2.5 py-2 text-left transition hover:border-[#16845f] hover:bg-[#f5fbf8] sm:max-w-[280px] sm:px-3 lg:max-w-[360px]"
              >

                {/* LOCATION ICON */}

                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#effaf4] text-[#16845f]">

                  {locationLoading ? (
                    <LoaderCircle
                      size={17}
                      className="animate-spin"
                    />
                  ) : (
                    <MapPin size={17} />
                  )}

                </span>

                {/* LOCATION TEXT */}

                <span className="min-w-0 flex-1">

                  <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#16845f] sm:text-[10px]">
                    Your location
                  </span>

                  <span className="block truncate text-xs font-semibold text-[#12345b] sm:text-sm">
                    {navbarLocation}
                  </span>

                </span>

                <ChevronDown
                  size={15}
                  className={`hidden shrink-0 text-slate-400 transition-transform sm:block ${
                    locationPopupOpen
                      ? "rotate-180"
                      : ""
                  }`}
                />

              </button>

              {/* =================================
                  LOCATION POPUP CARD
              ================================= */}

              {locationPopupOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[330px] max-w-[calc(100vw-32px)] rounded-2xl border border-[#dcebe4] bg-white p-5 shadow-2xl">

                  {/* Popup Header */}

                  <div className="flex items-start gap-3">

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#effaf4] text-[#16845f]">

                      <MapPin
                        size={21}
                      />

                    </div>

                    <div className="min-w-0">

                      <p className="text-sm font-extrabold text-[#12345b]">
                        Your current location
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        This location is used
                        to find nearby
                        professionals.
                      </p>

                    </div>

                  </div>

                  {/* Full Address */}

                  <div className="mt-4 rounded-xl border border-[#dcebe4] bg-[#f7faf8] p-4">

                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#16845f]">
                      Full address
                    </p>

                    <p className="mt-2 break-words text-sm font-semibold leading-6 text-[#12345b]">
                      {location?.address
                        ?.formatted ||
                        "Location is currently unavailable."}
                    </p>

                  </div>

                  {/* Coordinates */}

                  {location?.latitude &&
                    location?.longitude && (
                      <div className="mt-3 grid grid-cols-2 gap-2">

                        <div className="rounded-xl bg-slate-50 p-3">

                          <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                            Latitude
                          </p>

                          <p className="mt-1 break-all text-xs font-bold text-[#12345b]">
                            {location.latitude.toFixed(
                              6
                            )}
                          </p>

                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">

                          <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                            Longitude
                          </p>

                          <p className="mt-1 break-all text-xs font-bold text-[#12345b]">
                            {location.longitude.toFixed(
                              6
                            )}
                          </p>

                        </div>

                      </div>
                    )}

                  {/* Refresh */}

                  <button
                    type="button"
                    onClick={() => {
                      fetchLocation().catch(
                        () => {}
                      );
                    }}
                    disabled={
                      locationLoading
                    }
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16845f] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#11704f] disabled:cursor-not-allowed disabled:opacity-60"
                  >

                    <RefreshCw
                      size={16}
                      className={
                        locationLoading
                          ? "animate-spin"
                          : ""
                      }
                    />

                    {locationLoading
                      ? "Updating location..."
                      : "Refresh location"}

                  </button>

                </div>
              )}

            </div>

            {/* CUSTOMER DETAILS, PROFILE AND LOGOUT */}
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">

            {/* CUSTOMER NAME */}

            <div className="hidden text-right lg:block">

              <p className="text-sm font-bold text-[#12345b]">
                {customerName}
              </p>

              <p className="text-xs text-slate-500">
                Customer
              </p>

            </div>

            {/* PROFILE */}

            <ProfileAvatar
              src={
                customer?.profilePhoto
              }
              name={customerName}
              size="sm"
            />

            {/* LOGOUT */}

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#16845f] hover:text-[#16845f]"
            >

              <LogOut size={16} />

              <span className="hidden sm:inline">
                Logout
              </span>

            </button>
            </div>

          </div>

        </div>

      </div>

      {/* =====================================
          MAIN CONTENT
      ===================================== */}

      <div className="mx-auto max-w-7xl px-4 lg:pl-[var(--sidebar-space)] py-8 sm:px-6 lg:px-8 lg:py-10">


        {/* =====================================
            CUSTOMER PROFILE
        ===================================== */}

        <section className="mb-6 rounded-[2rem] border border-[#dcebe4] bg-white p-5 shadow-sm sm:p-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">

            <ProfileAvatar
              src={
                customer?.profilePhoto
              }
              name={customerName}
              size="lg"
            />

            <div className="min-w-0">

              <p className="text-xs font-black uppercase tracking-wider text-[#16845f]">
                Customer profile
              </p>

              <h2 className="mt-1 truncate text-xl font-black text-[#12345b]">
                {customerName}
              </h2>

              <p className="mt-1 text-sm font-semibold text-[#526b86]">
                Customer
              </p>

              {(customer?.address?.area ||
                customer?.address?.city) && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#526b86]">

                  <MapPin size={15} />

                  {[
                    customer?.address
                      ?.area,

                    customer?.address
                      ?.city,
                  ]
                    .filter(Boolean)
                    .join(", ")}

                </p>
              )}

            </div>


          </div>

        </section>

        {/* =====================================
            REQUEST + SIDEBAR
        ===================================== */}

        <div className="grid gap-6">

          {/* =================================
              NEW REQUEST
          ================================= */}

          <section className="rounded-[2rem] border border-[#e0ebe6] bg-white p-5 shadow-sm sm:p-7">

            <div className="flex items-start justify-between gap-4">

              <div>

                <p className="text-sm font-bold text-[#16845f]">
                  New request
                </p>

                <h2 className="mt-1 text-2xl font-black text-[#12345b]">
                  Request a professional
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Create a new request
                  independently, even if
                  another request is already
                  active.
                </p>

              </div>

              <div className="rounded-2xl bg-[#effaf4] px-4 py-3 text-center">

                <p className="text-xs font-bold text-[#16845f]">
                  ACTIVE
                </p>

                <p className="text-2xl font-black text-[#16845f]">

                  {
                    requests.filter(
                      (request) =>
                        [
                          "REQUESTED",
                          "ASSIGNED",
                          "IN_PROGRESS",
                          "WORK_COMPLETION_REQUESTED",
                        ].includes(
                          request.status
                        )
                    ).length
                  }

                </p>

              </div>

            </div>

            <form
              onSubmit={submit}
              className="mt-6"
            >

              {/* SERVICE SELECTION */}

              <p className="text-sm font-bold text-[#12345b]">
                Select a service
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">

                {SERVICES.map(
                  (service) => {
                    const Icon =
                      service.icon;

                    const selected =
                      selectedService ===
                      service.name;

                    return (
                      <button
                        key={
                          service.name
                        }
                        type="button"
                        aria-pressed={
                          selected
                        }
                        onClick={() =>
                          setSelectedService(
                            service.name
                          )
                        }
                        className={`group flex min-h-[164px] flex-col rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16845f]/20 ${
                          selected
                            ? "border-[#16845f] bg-[#effaf4] shadow-sm ring-1 ring-[#16845f]/10"
                            : "border-slate-200 bg-white shadow-[0_1px_2px_rgba(18,52,91,0.04)] hover:border-[#b9dcca] hover:bg-[#fbfefd]"
                        }`}
                      >

                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                            selected
                              ? "bg-[#16845f] text-white"
                              : "bg-[#eef7f3] text-[#16845f] group-hover:bg-[#e2f3eb]"
                          }`}
                        >

                          <Icon
                            size={21}
                          />

                        </div>

                        <p className="mt-3 font-extrabold tracking-tight text-[#12345b]">
                          {
                            service.name
                          }
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {
                            service.description
                          }
                        </p>

                      </button>
                    );
                  }
                )}

              </div>

              {/* SERVICE DESCRIPTION */}

              {selectedServiceDetails && (
                <div className="mt-7 space-y-5">

                  <div>

                    <label
                      htmlFor="service-description"
                      className="text-sm font-bold text-[#12345b]"
                    >
                      Describe the problem
                    </label>

                    <textarea
                      id="service-description"
                      value={
                        description
                      }
                      onChange={(event) =>
                        setDescription(
                          event.target
                            .value
                        )
                      }
                      required
                      minLength={3}
                      maxLength={2000}
                      rows={5}
                      placeholder="Tell us what you need help with..."
                      className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm text-[#12345b] outline-none transition focus:border-[#16845f] focus:ring-4 focus:ring-[#16845f]/10"
                    />

                    <p className="mt-1 text-right text-xs text-slate-400">
                      {
                        description.length
                      }
                      /2000
                    </p>

                  </div>

                  <div>
                    <p className="text-sm font-bold text-[#12345b]">Worker experience</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {[
                        ["ANY", "Any", "Send this request to all eligible available workers within 10 km."],
                        ["EXPERIENCED", "Experienced", "Send this request only to cooperative-admin-approved experienced workers within 10 km."],
                      ].map(([value, label, help]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={experiencePreference === value}
                          onClick={() => {
                            setExperiencePreference(value);
                            setAmount(value === "EXPERIENCED" ? "599" : "499");
                          }}
                          className={`rounded-2xl border p-4 text-left transition ${experiencePreference === value ? "border-[#16845f] bg-[#effaf4] shadow-sm" : "border-slate-200 hover:border-[#b9dcca]"}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-extrabold text-[#12345b]">{label}</span>
                            <span className={`h-4 w-4 rounded-full border-2 ${experiencePreference === value ? "border-[#16845f] bg-[#16845f]" : "border-slate-300"}`} />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{help}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="service-amount" className="text-sm font-bold text-[#12345b]">Amount</label>
                    <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-white focus-within:border-[#16845f] focus-within:ring-4 focus-within:ring-[#16845f]/10">
                      <span className="px-4 text-lg font-black text-[#12345b]">₹</span>
                      <input
                        id="service-amount"
                        type="number"
                        min={amountBounds.min}
                        max={amountBounds.max}
                        step="1"
                        required
                        value={amount}
                        onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                        className="w-full rounded-2xl bg-transparent px-2 py-3.5 text-sm font-bold text-[#12345b] outline-none"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Allowed amount: ₹{amountBounds.min.toLocaleString("en-IN")} – ₹{amountBounds.max.toLocaleString("en-IN")} for {experiencePreference === "EXPERIENCED" ? "experienced" : "any"} professionals.</p>
                  </div>

                  {/* =================================
                      FIND & NOTIFY BUTTON
                      ================================= */}

                  <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      locationLoading ||
                      !customer
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16845f] px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-[#16845f]/15 transition hover:bg-[#11704f] focus:outline-none focus:ring-4 focus:ring-[#16845f]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >

                    {submitting
                      ? "Finding professionals..."
                      : "Find & Notify Workers"}

                    {!submitting && (
                      <ArrowRight
                        size={18}
                      />
                    )}

                  </button>
                  </div>

                </div>
              )}

              {/* REQUEST STATUS */}

              {requestStatus && (
                <div
                  className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700"
                  role="status"
                >
                  {
                    requestStatus
                  }
                </div>
              )}

            </form>

          </section>

        </div>

        {/* =====================================
            REQUEST ACTIVITY
        ===================================== */}

        <section className="mt-6 rounded-[2rem] border border-[#e0ebe6] bg-white p-5 shadow-sm sm:p-7">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

            <div>

              <p className="text-sm font-bold text-[#16845f]">
                Request activity
              </p>

              <h2 className="mt-1 text-2xl font-black text-[#12345b]">
                Your service requests
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Every request is
                independent. You can create
                another request without
                waiting for previous
                requests to finish.
              </p>

            </div>

            <button
              type="button"
              onClick={loadRequests}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-[#16845f] hover:text-[#16845f]"
            >

              <RefreshCw
                size={16}
              />

              Refresh

            </button>

          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">

            {requests.filter((request) => isActiveRequest(request) && !hiddenUntilAcceptanceConfirmed.has(String(request.id))).length ? (
              requests.filter((request) => isActiveRequest(request) && !hiddenUntilAcceptanceConfirmed.has(String(request.id))).map(
                (request) => {
                  const meta =
                    statusMeta[
                      request.status
                    ] ||
                    statusMeta.REQUESTED;

                  const StatusIcon =
                    meta.icon;

                  const worker =
                    request.assignedWorker;

                  const canCancel =
                    CANCELLABLE_STATUSES.includes(
                      request.status
                    );

                  return (
                    <article
                      key={request.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-[#cfe4da] hover:shadow-sm"
                    >

                      {/* REQUEST HEADER */}

                      <div className="flex items-start justify-between gap-3">

                        <span className="inline-flex rounded-full bg-[#effaf4] px-3 py-1 text-xs font-extrabold text-[#16845f]">
                          {
                            request.service
                          }
                        </span>

                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-[#12345b]">

                          <StatusIcon
                            size={14}
                          />

                          {
                            meta.label
                          }

                        </span>

                      </div>

                      {/* DESCRIPTION */}

                      <h3 className="mt-4 text-lg font-black text-[#12345b]">
                        Service request
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {
                          request.description
                        }
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#effaf4] px-3 py-1 text-xs font-extrabold text-[#16845f]">
                          {request.experiencePreference === "EXPERIENCED" ? "Experienced professionals" : "Any professional"}
                        </span>
                        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-extrabold text-[#12345b]">
                          ₹{Number(request.amount || 0).toLocaleString("en-IN")}
                        </span>
                      </div>

                      {/* ASSIGNED WORKER */}

                      {request.status ===
                        "ASSIGNED" &&
                        worker && (
                          <div className="mt-4 rounded-2xl border border-[#cfe7da] bg-[#f1faf5] p-4">

                            <div className="flex items-center gap-3">

                              <ProfileAvatar
                                src={
                                  worker.profilePhoto
                                }
                                name={
                                  worker.name ||
                                  "Professional"
                                }
                                size="md"
                                className="ring-2"
                              />

                              <div className="min-w-0 flex-1">

                                <p className="text-xs font-bold uppercase tracking-wide text-[#16845f]">
                                  Professional found
                                </p>

                                <p className="mt-1 font-black text-[#12345b]">
                                  {
                                    worker.name ||
                                    "Professional"
                                  }
                                </p>

                                <p className="mt-1 text-xs text-slate-600">

                                  ★{" "}

                                  {Number(
                                    worker.rating ||
                                      0
                                  ).toFixed(
                                    1
                                  )}

                                  {" · "}

                                  {
                                    worker.experienceYears ||
                                    0
                                  }

                                  {" years experience"}

                                </p>

                                <p className="mt-2 text-xs font-semibold text-slate-600">
                                  {worker.totalJobsCompleted || 0} completed jobs · {worker.totalRatings || 0} customer ratings
                                </p>
                                {worker.experienceCategory && (
                                  <p className="mt-1 text-xs font-bold text-[#16845f]">
                                    Category: {worker.experienceCategory === "EXPERIENCED" ? "Experienced" : worker.experienceCategory === "ANY" ? "Any" : "Pending admin classification"}
                                  </p>
                                )}
                                {worker.cooperative?.name && (
                                  <p className="mt-1 text-xs font-bold text-[#12345b]">
                                    Cooperative: {worker.cooperative.name}
                                  </p>
                                )}

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button type="button" onClick={() => openWorkerProfile(worker, request.service)} className="rounded-lg bg-[#12345b] px-3 py-2 text-xs font-extrabold text-white hover:bg-[#0d2847]">View full profile</button>
                                  <button type="button" onClick={() => toggleSavedProfessional(worker.id, savedProfessionals.some((item) => String(item._id) === String(worker.id)))} className="rounded-lg border border-[#cfe7da] bg-white px-3 py-2 text-xs font-extrabold text-[#16845f]">
                                    <Heart size={13} className="mr-1 inline" fill={savedProfessionals.some((item) => String(item._id) === String(worker.id)) ? "currentColor" : "none"} />
                                    {savedProfessionals.some((item) => String(item._id) === String(worker.id)) ? "Saved" : "Save professional"}
                                  </button>
                                </div>

                              </div>

                              <CheckCircle2
                                className="shrink-0 text-[#16845f]"
                                size={25}
                              />

                            </div>

                            {worker.phone && (
                              <p className="mt-3 text-sm font-bold text-[#12345b]">
                                Contact
                                professional:{" "}
                                {
                                  worker.phone
                                }
                              </p>
                            )}

                          </div>
                        )}

                      {/* REQUESTED */}

                      {request.status === "REQUESTED" && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-4 overflow-hidden rounded-2xl border border-[#d8eee3] bg-[#f3fbf7] p-4"
                        >
                          <div className="flex items-center gap-3">
                            <motion.div
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#16845f] shadow-sm"
                              animate={{ scale: [1, 1.08, 1], boxShadow: ["0 0 0 0 rgba(22,132,95,0.10)", "0 0 0 10px rgba(22,132,95,0)", "0 0 0 0 rgba(22,132,95,0.10)"] }}
                              transition={{ duration: 1.8, repeat: Infinity }}
                            >
                              <Search size={19} />
                            </motion.div>
                            <div className="min-w-0 flex-1">
                              <p className="font-extrabold text-[#12345b]">Finding nearby professionals</p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">Available professionals within 10 km are being notified. The first professional to accept will be assigned to you.</p>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-1.5" aria-label="Searching for professionals">
                            {[0, 1, 2].map((index) => (
                              <motion.span
                                key={index}
                                className="h-2 w-2 rounded-full bg-[#16845f]"
                                animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
                                transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.16 }}
                              />
                            ))}
                            <span className="ml-2 text-xs font-bold text-[#16845f]">Searching...</span>
                          </div>
                        </motion.div>
                      )}

                      {/* IN PROGRESS */}

                      {request.status === "IN_PROGRESS" && worker && (
                        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                          <p className="font-extrabold text-[#12345b]">Service in progress</p>
                          <p className="mt-1 text-sm text-slate-600">Professional: {worker.name || "Professional"}</p>
                          <p className="mt-2 text-xs text-slate-500">Your professional will ask you to confirm when the work is finished.</p>
                        </div>
                      )}

                      {/* COMPLETION REQUEST */}

                      {request.status === "WORK_COMPLETION_REQUESTED" && worker && (
                        <div className="mt-4 rounded-2xl border border-[#cfe7da] bg-[#f1faf5] p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#16845f] shadow-sm"><CheckCircle2 size={20} /></div>
                            <div className="min-w-0 flex-1">
                              <p className="font-extrabold text-[#12345b]">Professional says the work is complete</p>
                              <p className="mt-1 text-sm leading-6 text-slate-600">Confirm the work is actually finished. A verification code will be shown after confirmation.</p>
                            </div>
                          </div>

                          {completionCode?.jobId === String(request.id) ? (
                            <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4 text-center">
                              <KeyRound className="mx-auto text-[#16845f]" size={22} />
                              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">Give this code to your professional</p>
                              <p className="mt-1 text-3xl font-black tracking-[0.35em] text-[#12345b]">{completionCode.otp}</p>
                              <p className="mt-2 text-xs text-slate-500">Code expires in 15 minutes.</p>
                            </div>
                          ) : (
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                              <button type="button" disabled={completionBusyId === request.id} onClick={() => confirmCompletion(request)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#16845f] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#11704f] disabled:opacity-50">
                                <CheckCircle2 size={16} /> {completionBusyId === request.id ? "Confirming..." : "Confirm & Show Code"}
                              </button>
                              <button type="button" disabled={completionBusyId === request.id} onClick={() => setDisputeJob(request)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-extrabold text-red-600 hover:bg-red-50 disabled:opacity-50">
                                <AlertTriangle size={16} /> Report a Problem
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* DISPUTED */}

                      {request.status === "CUSTOMER_DISPUTED" && (
                        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
                          <p className="font-extrabold text-[#12345b]">Problem reported</p>
                          <p className="mt-1 text-sm text-slate-600">The service has not been marked completed. Please resolve the issue with the professional or cooperative.</p>
                        </div>
                      )}

                      {/* COMPLETED */}

                      {request.status === "COMPLETED" && (
                        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                          <p className="font-extrabold text-[#12345b]">Service completed and verified ✓</p>
                          {worker && <p className="mt-1 text-sm text-slate-600">Professional: {worker.name || "Professional"}</p>}
                          {request.rating ? (
                            <div className="mt-3 rounded-xl bg-white p-3">
                              <div className="flex items-center gap-1 text-amber-500">
                                {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={16} fill={index < request.rating.rating ? "currentColor" : "none"} />)}
                              </div>
                              {request.rating.review && <p className="mt-2 text-sm font-medium text-slate-600">“{request.rating.review}”</p>}
                              <p className="mt-2 text-xs font-bold text-[#16845f]">Thank you for your feedback.</p>
                            </div>
                          ) : worker ? (
                            <button type="button" onClick={() => { setRatingJob(request); setRatingValue(0); setRatingReview(""); }} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#16845f] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#11704f]"><Star size={16} /> Rate Professional</button>
                          ) : null}
                        </div>
                      )}

                      {/* FOOTER */}

                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">

                        <p className="text-xs text-slate-400">

                          {request.createdAt
                            ? new Date(
                                request.createdAt
                              ).toLocaleString()
                            : ""}

                        </p>

                        {canCancel && (
                          <button
                            type="button"
                            onClick={() =>
                              cancelRequest(
                                request.id
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
                          >

                            <XCircle
                              size={16}
                            />

                            Cancel request

                          </button>
                        )}

                      </div>

                    </article>
                  );
                }
              )
            ) : (
              <div className="rounded-2xl bg-[#f7faf8] p-10 text-center lg:col-span-2">

                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#16845f] shadow-sm">

                  <Wrench size={25} />

                </div>

                <p className="mt-3 font-extrabold text-[#12345b]">
                  No service requests
                  yet
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Choose a service above
                  to create your first
                  request.
                </p>

              </div>
            )}

          </div>

        </section>

        <AnimatePresence>
          {acceptedWorkerPopup && (
            <motion.div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                initial={{ opacity: 0, scale: 0.9, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                className="w-full max-w-md rounded-[2rem] bg-white p-7 text-center shadow-2xl"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.12, type: "spring", stiffness: 300, damping: 17 }}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-[#16845f] ring-8 ring-emerald-50/70"
                >
                  <motion.svg width="34" height="34" viewBox="0 0 42 42" fill="none" aria-hidden="true">
                    <motion.path d="M10 22.5 17.5 30 32 13.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.5 }} />
                  </motion.svg>
                </motion.div>
                <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#16845f]">Professional found</p>
                <h2 className="mt-2 text-2xl font-black text-[#12345b]">Your professional is ready</h2>
                <p className="mt-2 text-sm text-slate-500">The first professional to accept your request has been assigned.</p>

                {acceptedWorkerPopup.worker && (
                  <div className="mt-5 rounded-2xl border border-[#dcebe4] bg-[#f7faf8] p-4 text-left">
                    <div className="flex items-center gap-3">
                      <ProfileAvatar src={acceptedWorkerPopup.worker.profilePhoto} name={acceptedWorkerPopup.worker.name} size="md" />
                      <div className="min-w-0">
                        <p className="font-black text-[#12345b]">{acceptedWorkerPopup.worker.name || "Professional"}</p>
                        <p className="text-xs text-slate-500">{acceptedWorkerPopup.service}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-white p-3"><p className="font-bold text-slate-400">Rating</p><p className="mt-1 font-black text-[#12345b]">★ {Number(acceptedWorkerPopup.worker.rating || 0).toFixed(1)}</p></div>
                      <div className="rounded-xl bg-white p-3"><p className="font-bold text-slate-400">Completed</p><p className="mt-1 font-black text-[#12345b]">{acceptedWorkerPopup.worker.totalJobsCompleted || 0}</p></div>
                      <div className="rounded-xl bg-white p-3"><p className="font-bold text-slate-400">Experience</p><p className="mt-1 font-black text-[#12345b]">{acceptedWorkerPopup.worker.experienceYears || 0} yrs</p></div>
                      <div className="rounded-xl bg-white p-3"><p className="font-bold text-slate-400">Category</p><p className="mt-1 font-black text-[#12345b]">{acceptedWorkerPopup.worker.experienceCategory === "EXPERIENCED" ? "Experienced" : "Any"}</p></div>
                    </div>
                    {acceptedWorkerPopup.worker.cooperative?.name && <p className="mt-3 text-xs font-bold text-[#16845f]">Cooperative: {acceptedWorkerPopup.worker.cooperative.name}</p>}
                  </div>
                )}

                <button type="button" onClick={confirmWorkerFoundPopup} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#16845f] px-5 py-3.5 font-extrabold text-white transition hover:bg-[#11704f]">OK, continue</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {disputeJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><AlertTriangle size={21} /></div>
                <div><h3 className="text-xl font-black text-[#12345b]">Report a problem</h3><p className="mt-1 text-sm leading-6 text-slate-500">Tell us what is incomplete or incorrect with the service.</p></div>
              </div>
              <textarea value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} maxLength={1000} rows={5} placeholder="Describe the problem..." className="mt-5 w-full resize-y rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-red-300 focus:ring-4 focus:ring-red-100" />
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => { setDisputeJob(null); setDisputeReason(""); }} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-extrabold text-slate-600">Cancel</button>
                <button type="button" disabled={completionBusyId === disputeJob.id} onClick={reportCompletionProblem} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50">{completionBusyId === disputeJob.id ? "Reporting..." : "Report Problem"}</button>
              </div>
            </div>
          </div>
        )}

        {ratingJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#effaf4] text-[#16845f]"><Star size={23} /></div>
                <h3 className="mt-4 text-2xl font-black text-[#12345b]">How was your experience?</h3>
                <p className="mt-1 text-sm text-slate-500">Rate {ratingJob.assignedWorker?.name || "your professional"}</p>
              </div>
              <div className="mt-6 flex justify-center gap-2" role="radiogroup" aria-label="Worker rating">
                {[1,2,3,4,5].map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={ratingValue === value} aria-label={`${value} star${value === 1 ? "" : "s"}`} onClick={() => setRatingValue(value)} className="rounded-lg p-1 text-amber-500 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-200"><Star size={34} fill={value <= ratingValue ? "currentColor" : "none"} /></button>
                ))}
              </div>
              <p className="mt-2 text-center text-sm font-bold text-[#12345b]">{ratingValue ? ["", "Poor", "Needs improvement", "Good", "Very good", "Excellent"][ratingValue] : "Select a rating"}</p>
              <textarea value={ratingReview} onChange={(event) => setRatingReview(event.target.value)} maxLength={1000} rows={4} placeholder="Tell us about your experience (optional)" className="mt-5 w-full resize-y rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-[#16845f] focus:ring-4 focus:ring-[#16845f]/10" />
              <p className="mt-1 text-right text-xs text-slate-400">{ratingReview.length}/1000</p>
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => { setRatingJob(null); setRatingValue(0); setRatingReview(""); }} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-extrabold text-slate-600">Cancel</button>
                <button type="button" disabled={!ratingValue || ratingSubmitting} onClick={submitRating} className="flex-1 rounded-xl bg-[#16845f] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#11704f] disabled:cursor-not-allowed disabled:opacity-50">{ratingSubmitting ? "Submitting..." : "Submit Rating"}</button>
              </div>
            </div>
          </div>
        )}

        {sidebarPanel !== "dashboard" && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8">
              {sidebarPanel === "activity" && (<>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#16845f]">Request Activity</p>
                    <h2 className="text-2xl font-black text-[#12345b]">All service requests</h2>
                    <p className="mt-1 text-sm text-slate-500">View your complete request history, including active, completed and cancelled requests.</p>
                  </div>
                  <button type="button" onClick={() => setSidebarPanel("dashboard")} className="rounded-xl border px-3 py-2 font-bold">Close</button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {requests.length ? requests.map((r) => {
                    const meta = statusMeta[r.status] || statusMeta.REQUESTED;
                    const StatusIcon = meta.icon;
                    const worker = r.assignedWorker;
                    const canRate = r.status === "COMPLETED" && !r.rating && worker;

                    return (
                      <article key={r.id} className="rounded-2xl border border-slate-200 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-black text-[#12345b]">{r.service}</p>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-[#12345b]">
                            <StatusIcon size={13} /> {meta.label}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{r.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-[#effaf4] px-3 py-1 text-xs font-extrabold text-[#16845f]">{r.experiencePreference === "EXPERIENCED" ? "Experienced professionals" : "Any professional"}</span>
                          <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-extrabold text-[#12345b]">₹{Number(r.amount || 0).toLocaleString("en-IN")}</span>
                        </div>
                        {worker?.name && <p className="mt-3 text-sm font-semibold text-slate-600">Professional: {worker.name}</p>}

                        {r.status === "COMPLETED" && (
                          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                            <p className="font-extrabold text-[#12345b]">Service completed and verified ✓</p>
                            {worker && <p className="mt-1 text-sm text-slate-600">Professional: {worker.name || "Professional"}</p>}
                            {r.rating ? (
                              <div className="mt-3 rounded-xl bg-white p-3">
                                <div className="flex items-center gap-1 text-amber-500">
                                  {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={16} fill={index < r.rating.rating ? "currentColor" : "none"} />)}
                                </div>
                                {r.rating.review && <p className="mt-2 text-sm font-medium text-slate-600">“{r.rating.review}”</p>}
                                <p className="mt-2 text-xs font-bold text-[#16845f]">Rated</p>
                              </div>
                            ) : canRate ? (
                              <button type="button" onClick={() => { setRatingJob(r); setRatingValue(0); setRatingReview(""); }} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#16845f] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#11704f]"><Star size={16} /> Rate Professional</button>
                            ) : null}

                            {worker?.id && (
                              savedProfessionals.some((item) => String(item._id) === String(worker.id)) ? (
                                <button
                                  type="button"
                                  disabled
                                  className="mt-3 inline-flex cursor-default items-center gap-2 rounded-xl border border-[#cfe7da] bg-white px-4 py-2.5 text-sm font-extrabold text-[#16845f]"
                                >
                                  <Heart size={16} fill="currentColor" />
                                  Added to Favourites
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => toggleSavedProfessional(worker.id, false)}
                                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#cfe7da] bg-white px-4 py-2.5 text-sm font-extrabold text-[#16845f] hover:bg-[#effaf4]"
                                >
                                  <Heart size={16} />
                                  Add to Favourites
                                </button>
                              )
                            )}
                          </div>
                        )}

                        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">{r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}</p>
                      </article>
                    );
                  }) : (
                    <p className="py-12 text-center text-slate-500 md:col-span-2">No service requests yet.</p>
                  )}
                </div>
              </>)}
              {sidebarPanel === "saved" && (<>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#16845f]">Saved Professionals</p>
                    <h2 className="text-2xl font-black text-[#12345b]">Your favourite professionals</h2>
                    <p className="mt-1 text-sm text-slate-500">Request a professional directly when they are available.</p>
                  </div>
                  <button onClick={() => setSidebarPanel("dashboard")} className="rounded-xl border px-3 py-2 font-bold">Close</button>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {savedLoading ? <p className="py-10 text-center text-slate-500 md:col-span-2">Loading...</p> : savedProfessionals.length ? savedProfessionals.map((w) => {
                    const workerServices = getWorkerServices(w);
                    const isAvailable = String(w.status || "").toUpperCase() === "AVAILABLE" && !w.isSuspended && w.isActive !== false;
                    return (
                      <div key={w._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <ProfileAvatar src={w.profilePhoto} name={w.fullName} size="md"/>
                            <div className="min-w-0">
                              <p className="truncate font-black text-[#12345b]">{w.fullName}</p>
                              <p className="text-xs text-slate-500">{workerServices.join(" · ") || "Professional"}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${isAvailable ? "bg-[#effaf4] text-[#16845f]" : "bg-slate-100 text-slate-500"}`}>
                            {isAvailable ? "Available" : "Unavailable"}
                          </span>
                        </div>

                        <div className="mt-4 text-sm text-slate-600">★ {Number(w.averageRating || 0).toFixed(1)} · {w.totalRatings || 0} ratings · {w.totalJobsCompleted || 0} completed jobs · {w.experienceYears || 0} years experience</div>
                        <p className="mt-2 text-xs font-bold text-[#16845f]">{w.cooperativeId?.name || "Not assigned"}</p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => openWorkerProfile(w)} className="flex-1 rounded-xl bg-[#12345b] px-3 py-2.5 text-xs font-bold text-white">View Profile</button>
                          <button type="button" onClick={() => openDirectRequest(w)} className="flex-1 rounded-xl bg-[#16845f] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#11704f]">Request Again</button>
                          <button type="button" onClick={() => toggleSavedProfessional(w._id, true)} className="rounded-xl border border-red-200 px-3 py-2.5 text-xs font-bold text-red-600">Remove</button>
                        </div>
                      </div>
                    );
                  }) : <p className="py-10 text-center text-slate-500 md:col-span-2">No saved professionals yet.</p>}
                </div>
              </>)}
              {sidebarPanel === "profile" && (<>
                <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[#16845f]">Profile & Settings</p><h2 className="text-2xl font-black text-[#12345b]">Personal information</h2></div><button onClick={() => setSidebarPanel("dashboard")} className="rounded-xl border px-3 py-2 font-bold">Close</button></div><div className="mt-6 grid gap-4 md:grid-cols-2">{[["Name", customer?.fullname || customer?.fullName], ["Email", customer?.email], ["Phone", customer?.phone], ["City", customer?.address?.city], ["State", customer?.address?.state], ["Pincode", customer?.address?.pincode]].map(([k,v]) => <div key={k} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-400">{k}</p><p className="mt-1 font-bold text-[#12345b]">{v || "Not provided"}</p></div>)}</div></>)}
             {sidebarPanel === "help" && (
  <>
    {/* Header */}
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-[#16845f]">
          Help & Support
        </p>

        <h2 className="mt-1 text-2xl font-black text-[#12345b]">
          How can we help?
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Find answers about requesting services, worker matching,
          location, and completed jobs.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setSidebarPanel("dashboard")}
        className="shrink-0 rounded-xl border border-slate-300 px-4 py-2 font-bold text-[#12345b] transition hover:bg-slate-50"
      >
        Close
      </button>
    </div>

    {/* FAQ Sections */}
    <div className="mt-6 space-y-6">

      {/* Getting Started */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-wider text-[#16845f]">
          Getting Started
        </p>

        <div className="space-y-3">

          <details
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#16845f]"
          >
            <summary className="cursor-pointer list-none font-bold text-[#12345b]">
              <div className="flex items-center justify-between gap-4">
                <span>How do I request a service?</span>

                <span className="text-xl text-[#16845f] group-open:hidden">
                  +
                </span>

                <span className="hidden text-xl text-[#16845f] group-open:block">
                  −
                </span>
              </div>
            </summary>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Select the service you need, describe the problem, choose
              your preferred experience level, and enter your budget.
              Sahayog will find eligible professionals based on the
              selected service, availability, experience and current
              location.
            </p>
          </details>

        </div>
      </div>

      {/* Requests & Matching */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-wider text-[#16845f]">
          Requests & Matching
        </p>

        <div className="space-y-3">

          <details
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#16845f]"
          >
            <summary className="cursor-pointer list-none font-bold text-[#12345b]">
              <div className="flex items-center justify-between gap-4">
                <span>How does nearby worker matching work?</span>

                <span className="text-xl text-[#16845f] group-open:hidden">
                  +
                </span>

                <span className="hidden text-xl text-[#16845f] group-open:block">
                  −
                </span>
              </div>
            </summary>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Sahayog uses your current customer location to find
              eligible available workers within a 10 km radius.
              Matching considers the requested service, worker
              availability and experience category.
            </p>
          </details>

          <details
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#16845f]"
          >
            <summary className="cursor-pointer list-none font-bold text-[#12345b]">
              <div className="flex items-center justify-between gap-4">
                <span>Can I request a saved professional?</span>

                <span className="text-xl text-[#16845f] group-open:hidden">
                  +
                </span>

                <span className="hidden text-xl text-[#16845f] group-open:block">
                  −
                </span>
              </div>
            </summary>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Yes. Open Saved Professionals and select the professional
              you want to request again. A request made using
              "Request Again" is sent only to that selected professional
              if they are currently available.
            </p>
          </details>

          <details
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#16845f]"
          >
            <summary className="cursor-pointer list-none font-bold text-[#12345b]">
              <div className="flex items-center justify-between gap-4">
                <span>
                  What happens if my saved professional is unavailable?
                </span>

                <span className="text-xl text-[#16845f] group-open:hidden">
                  +
                </span>

                <span className="hidden text-xl text-[#16845f] group-open:block">
                  −
                </span>
              </div>
            </summary>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              If the selected professional is unavailable, Sahayog will
              show a worker unavailable message. The request will not
              automatically be sent to another professional.
            </p>
          </details>

        </div>
      </div>

      {/* Location & Privacy */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-wider text-[#16845f]">
          Location & Privacy
        </p>

        <div className="space-y-3">

          <details
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#16845f]"
          >
            <summary className="cursor-pointer list-none font-bold text-[#12345b]">
              <div className="flex items-center justify-between gap-4">
                <span>How is my location used?</span>

                <span className="text-xl text-[#16845f] group-open:hidden">
                  +
                </span>

                <span className="hidden text-xl text-[#16845f] group-open:block">
                  −
                </span>
              </div>
            </summary>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your current dashboard location is used to find nearby
              service professionals. Customer-worker matching uses the
              location detected from the customer dashboard location
              control.
            </p>
          </details>

        </div>
      </div>

      {/* Request Management */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-wider text-[#16845f]">
          Request Management
        </p>

        <div className="space-y-3">

          <details
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#16845f]"
          >
            <summary className="cursor-pointer list-none font-bold text-[#12345b]">
              <div className="flex items-center justify-between gap-4">
                <span>How do I cancel a request?</span>

                <span className="text-xl text-[#16845f] group-open:hidden">
                  +
                </span>

                <span className="hidden text-xl text-[#16845f] group-open:block">
                  −
                </span>
              </div>
            </summary>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Open Request Activity and select the active request you
              want to cancel. Use the cancel option and confirm the
              cancellation. Once cancelled, the request will no longer
              be available for worker acceptance.
            </p>
          </details>

        </div>
      </div>

      {/* Service Completion */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-wider text-[#16845f]">
          Service Completion
        </p>

        <div className="space-y-3">

          <details
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#16845f]"
          >
            <summary className="cursor-pointer list-none font-bold text-[#12345b]">
              <div className="flex items-center justify-between gap-4">
                <span>How is service completion verified?</span>

                <span className="text-xl text-[#16845f] group-open:hidden">
                  +
                </span>

                <span className="hidden text-xl text-[#16845f] group-open:block">
                  −
                </span>
              </div>
            </summary>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              After the worker completes the service, the customer
              confirms the work through the service verification
              process. The verification code is used to securely
              confirm completion of the job.
            </p>
          </details>

          <details
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#16845f]"
          >
            <summary className="cursor-pointer list-none font-bold text-[#12345b]">
              <div className="flex items-center justify-between gap-4">
                <span>How do I rate a professional?</span>

                <span className="text-xl text-[#16845f] group-open:hidden">
                  +
                </span>

                <span className="hidden text-xl text-[#16845f] group-open:block">
                  −
                </span>
              </div>
            </summary>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              After a service is successfully completed, you can rate
              the professional and optionally leave a comment. Your
              rating and feedback contribute to the professional's
              profile.
            </p>
          </details>

        </div>
      </div>

      {/* Saved Professionals */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-wider text-[#16845f]">
          Saved Professionals
        </p>

        <div className="space-y-3">

          <details
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#16845f]"
          >
            <summary className="cursor-pointer list-none font-bold text-[#12345b]">
              <div className="flex items-center justify-between gap-4">
                <span>How do I save a professional?</span>

                <span className="text-xl text-[#16845f] group-open:hidden">
                  +
                </span>

                <span className="hidden text-xl text-[#16845f] group-open:block">
                  −
                </span>
              </div>
            </summary>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              When viewing a professional's profile, use the save
              option to add that professional to your Saved
              Professionals list. You can use this list to quickly
              access their profile and request their services again.
            </p>
          </details>

        </div>
      </div>

    </div>
  </>
)}
            </div>
          </div>
        )}

        {selectedWorkerProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
            <div className="my-6 w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <ProfileAvatar
                    src={selectedWorkerProfile.profilePhoto}
                    name={selectedWorkerProfile.fullName || selectedWorkerProfile.name}
                    size="xl"
                  />
                  <div className="min-w-0">
                    <h3 className="truncate text-2xl font-black text-[#12345b]">
                      {selectedWorkerProfile.fullName || selectedWorkerProfile.name || "Professional"}
                    </h3>
                    <p className="text-sm font-semibold text-[#16845f]">
                      {selectedWorkerProfile.requestedService || getWorkerServices(selectedWorkerProfile).join(" · ") || "Professional"}
                      {selectedWorkerProfile.experienceCategory ? ` · ${selectedWorkerProfile.experienceCategory}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedWorkerProfile.cooperativeId?.name || selectedWorkerProfile.cooperative?.name || "Not assigned"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeWorkerProfile}
                  disabled={profileLoading}
                  className="rounded-xl border px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              {profileLoading ? (
                <div className="py-16 text-center">
                  <LoaderCircle className="mx-auto animate-spin text-[#16845f]" size={32} />
                  <p className="mt-4 font-bold text-[#12345b]">Loading professional profile...</p>
                  <p className="mt-1 text-sm text-slate-500">Fetching the latest ratings, comments and cooperative details.</p>
                </div>
              ) : profileError ? (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
                  <p className="font-bold text-red-700">Unable to load professional profile.</p>
                  <p className="mt-1 text-sm text-red-600">{profileError}</p>
                  <button
                    type="button"
                    onClick={() => openWorkerProfile(selectedWorkerProfile, selectedWorkerProfile.requestedService || "")}
                    className="mt-4 rounded-xl bg-[#12345b] px-4 py-2.5 text-sm font-extrabold text-white"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      ["Rating", `★ ${Number(selectedWorkerProfile.averageRating ?? selectedWorkerProfile.rating ?? 0).toFixed(1)}`],
                      ["Ratings", selectedWorkerProfile.totalRatings || 0],
                      ["Completed jobs", selectedWorkerProfile.totalJobsCompleted || 0],
                      ["Experience", `${selectedWorkerProfile.experienceYears || 0} years`],
                      ["Category", selectedWorkerProfile.experienceCategory || "PENDING"],
                      ["Cooperative", selectedWorkerProfile.cooperativeId?.name || selectedWorkerProfile.cooperative?.name || "Not assigned"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-bold text-slate-400">{k}</p>
                        <p className="mt-1 font-black text-[#12345b]">{v}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase text-slate-400">Skills</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(selectedWorkerProfile.skills || []).map((skill) => skill?.service).filter(Boolean).map((skill) => (
                        <span key={skill} className="rounded-full bg-[#effaf4] px-3 py-1 text-xs font-bold text-[#16845f]">{skill}</span>
                      ))}
                      {!getWorkerServices(selectedWorkerProfile).length && <span className="text-sm text-slate-500">Skills not provided</span>}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase text-slate-400">Customer comments</p>
                      <span className="text-xs font-bold text-[#16845f]">{(selectedWorkerProfile.ratings || []).length} reviews</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {(selectedWorkerProfile.ratings || []).length ? selectedWorkerProfile.ratings.map((review) => (
                        <div key={review.id} className="rounded-xl bg-slate-50 p-3">
                          <div className="flex items-center gap-1 text-amber-500">
                            {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={14} fill={index < Number(review.rating || 0) ? "currentColor" : "none"} />)}
                          </div>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{review.review ? `“${review.review}”` : "No written comment provided."}</p>
                          {review.createdAt && <p className="mt-1 text-[11px] text-slate-400">{new Date(review.createdAt).toLocaleDateString()}</p>}
                        </div>
                      )) : <p className="text-sm text-slate-500">No reviews yet.</p>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {directRequestOpen && directRequestWorker && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
            <form onSubmit={submitDirectRequest} className="my-6 w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-[#16845f]">Saved Professional</p>
                  <h2 className="mt-1 text-2xl font-black text-[#12345b]">Request {directRequestWorker.fullName}</h2>
                  <p className="mt-1 text-sm text-slate-500">This request will be sent only to this professional.</p>
                </div>
                <button type="button" onClick={closeDirectRequest} disabled={directRequestSubmitting} className="rounded-xl border px-3 py-2 font-bold disabled:opacity-50">Close</button>
              </div>

              {String(directRequestWorker.status || "").toUpperCase() !== "AVAILABLE" ? (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <p className="font-black text-amber-800">Worker not available</p>
                  <p className="mt-1 text-sm leading-6 text-amber-700">This professional is currently unavailable. No request will be sent to them or to any other worker.</p>
                </div>
              ) : (
                <>
                  <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#effaf4] p-4">
                    <ProfileAvatar src={directRequestWorker.profilePhoto} name={directRequestWorker.fullName} size="md"/>
                    <div className="min-w-0">
                      <p className="font-black text-[#12345b]">{directRequestWorker.fullName}</p>
                      <p className="text-xs text-slate-500">{getWorkerServices(directRequestWorker).join(" · ") || "Professional"}</p>
                      <p className="mt-1 text-xs font-bold text-[#16845f]">● Available</p>
                    </div>
                  </div>

                  <label className="mt-5 block text-sm font-extrabold text-[#12345b]">Service
                    <select value={directRequestService} onChange={(e) => setDirectRequestService(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#16845f]">
                      {getWorkerServices(directRequestWorker).map((service) => <option key={service} value={service}>{service}</option>)}
                    </select>
                  </label>

                  <label className="mt-4 block text-sm font-extrabold text-[#12345b]">Description of work
                    <textarea value={directRequestDescription} onChange={(e) => setDirectRequestDescription(e.target.value)} rows={4} maxLength={2000} placeholder="Describe the work you need..." className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#16845f]" />
                  </label>

                  <label className="mt-4 block text-sm font-extrabold text-[#12345b]">Amount
                    <div className="mt-2 flex items-center rounded-xl border border-slate-200 px-4">
                      <span className="font-bold text-slate-400">₹</span>
                      <input type="number" min="499" max="4999" step="1" value={directRequestAmount} onChange={(e) => setDirectRequestAmount(e.target.value)} className="w-full border-0 px-3 py-3 text-sm font-bold outline-none" />
                    </div>
                    <span className="mt-1 block text-xs font-medium text-slate-400">Choose an amount between ₹499 and ₹4999.</span>
                  </label>

                  <div className="mt-5 rounded-xl border border-[#cfe7da] bg-[#f5fbf8] p-4 text-sm font-semibold leading-6 text-slate-600">
                    Only <span className="font-black text-[#12345b]">{directRequestWorker.fullName}</span> will receive this request. Other professionals will not be notified.
                  </div>

                  <button type="submit" disabled={directRequestSubmitting || !directRequestService} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16845f] px-4 py-3.5 text-sm font-extrabold text-white hover:bg-[#11704f] disabled:cursor-not-allowed disabled:opacity-60">
                    {directRequestSubmitting ? "Sending request..." : "Send Request"}
                  </button>
                </>
              )}
            </form>
          </div>
        )}

        {/* SOCKET STATUS */}

        <div className="mt-6 flex items-center justify-end gap-2 text-xs text-slate-400">

          <span
            className={`h-2 w-2 rounded-full ${
              socketConnected
                ? "bg-[#16845f]"
                : "bg-slate-300"
            }`}
          />

          {socketConnected
            ? "Live updates connected"
            : "Live updates reconnecting"}

        </div>

      </div>

    </main>
  );
}

/*
 * ==========================================
 * LOCATION ERROR HELPER
 * ==========================================
 */

function messageForLocationError(
  error
) {
  const message =
    error?.message || "";

  if (
    message.includes(
      "Customer access required"
    ) ||
    message.includes(
      "Unauthorized"
    )
  ) {
    return "Customer authentication expired. Please log in again.";
  }

  return "Unable to determine your service address. Please refresh your location and try again.";
}