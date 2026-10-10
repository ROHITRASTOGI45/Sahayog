import { useCallback, useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  LogOut,
  MapPin,
  RefreshCw,
  Star,
  XCircle,
  Users,
  ShieldCheck,
  ClipboardList,
  Ban,
  WalletCards,
  Award,
  Wrench,
  UserRound,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { api } from "../lib/api";
import logo from "../assets/logo.png";
import ProfileAvatar from "../components/ProfileAvatar";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const statusStyles = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  BUSY: "bg-amber-50 text-amber-700 border-amber-200",
  OFFLINE: "bg-slate-100 text-slate-600 border-slate-200",
};

const normalizeJob = (job) => ({
  ...job,
  id: job.id || job._id,
  location: job.location || { formatted: "Location unavailable" },
});

const getWorkerLocation = (worker) => {
  const address = worker?.address || {};
  return [address.area, address.city].filter(Boolean).join(", ") || null;
};

export default function WorkerDashboard({ worker, onLogout }) {
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(worker?.status || "OFFLINE");
  const [processingId, setProcessingId] = useState(null);
  const [acceptedRequest, setAcceptedRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [cooperatives, setCooperatives] = useState([]);
  const [cooperativeMessage, setCooperativeMessage] = useState("");
  const [joiningCooperativeId, setJoiningCooperativeId] = useState(null);
  const [pendingCooperativeIds, setPendingCooperativeIds] = useState(new Set());
  const [completionOtp, setCompletionOtp] = useState("");
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completionVerificationOpen, setCompletionVerificationOpen] = useState(false);
  const [workerStats, setWorkerStats] = useState({
    totalJobsCompleted: Number(worker?.totalJobsCompleted) || 0,
    averageRating: Number(worker?.averageRating) || 0,
    totalRatings: Number(worker?.totalRatings) || 0,
  });
  const [history, setHistory] = useState([]);
  const [allCompletedJobs, setAllCompletedJobs] = useState([]);
  const [cancelledJobs, setCancelledJobs] = useState([]);
  const [completedJobsOpen, setCompletedJobsOpen] = useState(false);
  const [cooperativeName, setCooperativeName] = useState(worker?.cooperativeId?.name || "");
  const [experienceCategory, setExperienceCategory] = useState(worker?.experienceCategory || "PENDING");
  const [sidebarPanel, setSidebarPanel] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [location, setLocation] = useState(() => {
    const coordinates = worker?.currentLocation?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  });
  const [registrationLocation, setRegistrationLocation] = useState(worker?.registrationLocation || null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState("Location not detected");
  const [locationAddress, setLocationAddress] = useState(
    worker?.currentLocation?.address?.formatted || "Location unavailable"
  );
  const [locationPopupOpen, setLocationPopupOpen] = useState(false);
  const locationInitializedRef = useRef(false);

  const detectAndSaveLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not supported by this browser.");
      return null;
    }

    setLocationLoading(true);
    setLocationStatus("Detecting your current location...");

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new Error("Invalid location coordinates.");
      }

      // Save current GPS coordinates for customer-worker matching.
      const response = await api("/workers/location", {
        method: "PATCH",
        body: JSON.stringify({ latitude, longitude }),
      });

      // Reuse the existing reverse-geocoding API to show a readable
      // address in the worker navbar and location popup.
      let address = null;

      try {
        const addressResponse = await api("/location/reverse-geocode", {
          method: "POST",
          body: JSON.stringify({ latitude, longitude }),
        });

        address =
          addressResponse.data?.address ||
          addressResponse.address ||
          null;

        if (!address?.formatted) {
          throw new Error("Reverse geocoding returned no address.");
        }
      } catch {
        setLocationAddress("Unable to determine current location");
      }

      const updatedLocation = {
        latitude,
        longitude,
        accuracy: Number(accuracy) || null,
        ...(address ? { address } : {}),
      };

      setLocation(updatedLocation);

      if (address?.formatted) {
        setLocationAddress(address.formatted);
        setLocationStatus(address.formatted);
      } else {
        setLocationStatus("Current location saved for request matching");
      }

      return response.data?.worker || updatedLocation;
    } catch (error) {
      const code = error?.code;
      const message = code === 1
        ? "Location permission denied. Please allow location access."
        : code === 2
          ? "Location unavailable. Please check your device location settings."
          : code === 3
            ? "Location request timed out. Please try again."
            : error?.message || "Unable to update your location.";
      setLocationStatus(message);
      return null;
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const response = await api("/worker-jobs/requests");
      setRequests((response.jobs || []).map(normalizeJob));
    } catch (error) {
      setMessage(error.message || "Unable to load service requests.");
    }
  }, []);

  const loadActiveAssignment = useCallback(async () => {
    try {
      const response = await api("/worker-jobs/active");
      setAcceptedRequest(response.jobs?.[0] ? normalizeJob(response.jobs[0]) : null);
    } catch {
      // Assignment history is supplementary and should not block the dashboard.
    }
  }, []);

  const loadWorkerProfile = useCallback(async () => {
    try {
      const response = await api("/workers/me");
      const currentWorker = response.data?.worker || response.worker || response.data || null;
      if (currentWorker) {
        setWorkerStats({
          totalJobsCompleted: Number(currentWorker.totalJobsCompleted) || 0,
          averageRating: Number(currentWorker.averageRating) || 0,
          totalRatings: Number(currentWorker.totalRatings) || 0,
        });
        if (currentWorker.status) setStatus(currentWorker.status);
        setCooperativeName(currentWorker.cooperativeId?.name || "");
        setExperienceCategory(currentWorker.experienceCategory || "PENDING");
        setRegistrationLocation(currentWorker.registrationLocation || null);
        const currentLocation = currentWorker.currentLocation;
        const coordinates = currentLocation?.coordinates;

        if (Array.isArray(coordinates) && coordinates.length === 2) {
          const longitude = Number(coordinates[0]);
          const latitude = Number(coordinates[1]);

          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            const savedAddress =
              currentLocation?.address?.formatted ||
              currentLocation?.address?.displayName ||
              currentLocation?.formattedAddress ||
              null;

            setLocation((current) =>
              current || {
                latitude,
                longitude,
                ...(savedAddress
                  ? { address: { formatted: savedAddress } }
                  : {}),
              }
            );

            if (savedAddress) {
              setLocationAddress(savedAddress);
              setLocationStatus(savedAddress);
            } else {
              setLocationStatus("Current location saved for request matching");
            }
          }
        }
      }
    } catch {
      // Profile statistics are supplementary to the assignment flow.
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await api("/worker-jobs/history");
      setHistory((response.jobs || []).map(normalizeJob));
    } catch {
      // History is supplementary and should not block the dashboard.
    }
  }, []);

  const loadCancelledJobs = useCallback(async () => {
    try {
      const response = await api("/worker-jobs/cancelled-jobs");
      setCancelledJobs((response.jobs || []).map(normalizeJob));
    } catch (error) {
      setMessage(error.message || "Unable to load cancelled jobs.");
    }
  }, []);

  const loadAllCompletedJobs = useCallback(async () => {
    try {
      const response = await api("/worker-jobs/completed-jobs");
      setAllCompletedJobs((response.jobs || []).map(normalizeJob));
    } catch (error) {
      setMessage(error.message || "Unable to load completed jobs.");
    }
  }, []);

  const loadCooperatives = useCallback(async () => {
    try {
      const coordinates = registrationLocation?.coordinates;
      const params = Array.isArray(coordinates) && coordinates.length === 2
        ? `?latitude=${encodeURIComponent(Number(coordinates[1]))}&longitude=${encodeURIComponent(Number(coordinates[0]))}`
        : "";
      const response = await api(`/workers/cooperatives${params}`);
      setCooperatives(response.data?.cooperatives || []);
    } catch {
      // Cooperative onboarding should not block the worker dashboard.
    }
  }, [registrationLocation]);

  const loadPendingCooperativeRequests = useCallback(async () => {
    try {
      const response = await api("/workers/cooperative-requests");
      const pendingRequests = response.data?.requests || [];
      setPendingCooperativeIds(
        new Set(
          pendingRequests
            .filter((request) => request.status === "PENDING")
            .map((request) => String(request.cooperativeId?._id || request.cooperativeId))
        )
      );
    } catch {
      // Keep the cooperative directory usable if request history is unavailable.
    }
  }, []);

  const joinCooperative = async (cooperativeId) => {
    setJoiningCooperativeId(cooperativeId);
    try {
      await api(`/workers/cooperatives/${cooperativeId}/request`, {
        method: "POST",
        body: JSON.stringify({
          message: "I would like to join this cooperative and provide my listed services.",
        }),
      });
      setCooperativeMessage("Join request sent successfully. The cooperative admin will review it.");
      setPendingCooperativeIds((current) => new Set([...current, String(cooperativeId)]));
      await loadCooperatives();
    } catch (error) {
      setCooperativeMessage(error.message || "Unable to send join request.");
    } finally {
      setJoiningCooperativeId(null);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([loadRequests(), loadActiveAssignment(), loadWorkerProfile(), loadHistory()]);
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
    loadActiveAssignment();
    loadWorkerProfile();
    loadHistory();
    loadPendingCooperativeRequests();

    // Detect the worker's live/current location once when the dashboard
    // session starts. Do NOT make this effect depend on registrationLocation
    // or other profile objects: loadWorkerProfile() updates those objects,
    // and that would otherwise recreate this effect, call geolocation again,
    // PATCH /workers/location again, and reconnect the socket repeatedly.
    if (!locationInitializedRef.current) {
      locationInitializedRef.current = true;
      detectAndSaveLocation();
    }

    if (!window.io) return undefined;

    const socket = window.io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      auth: { role: "WORKER" },
    });

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("new-service-request", (request) => {
      if (!request?.requestId) return;
      const incoming = normalizeJob({
        id: request.requestId,
        service: request.service,
        description: request.description,
        status: "REQUESTED",
        location: request.location || { formatted: "Location unavailable" },
        distanceKm: request.distanceKm,
        experiencePreference: request.experiencePreference || "ANY",
        amount: request.amount,
      });
      setRequests((current) =>
        current.some((job) => String(job.id) === String(incoming.id))
          ? current
          : [incoming, ...current]
      );
      setMessage(`New ${request.service || "service"} request received.`);
    });

    socket.on("request-taken", ({ requestId, message: text }) => {
      setRequests((current) => current.filter((job) => String(job.id) !== String(requestId)));
      setMessage(text || "This request has already been accepted by another professional.");
    });

    socket.on("customer-confirmed-completion", ({ requestId }) => {
      if (!requestId) return;
      setAcceptedRequest((current) =>
        current && String(current.id) === String(requestId)
          ? { ...current, completion: { ...(current.completion || {}), customerConfirmedAt: new Date().toISOString() } }
          : current
      );
      setCompletionOtp("");
      setCompletionVerificationOpen(true);
      setMessage("Customer confirmed completion. Enter the 4-digit verification code.");
    });

    socket.on("completion-disputed", ({ requestId, message: text }) => {
      if (!requestId) return;
      setAcceptedRequest((current) =>
        current && String(current.id) === String(requestId)
          ? { ...current, status: "CUSTOMER_DISPUTED" }
          : current
      );
      setCompletionOtp("");
      setMessage(text || "The customer reported a problem with the service completion.");
    });

    socket.on("job-status-updated", ({ requestId, status: nextStatus }) => {
      if (!requestId) return;
      if (nextStatus === "COMPLETED") {
        setAcceptedRequest((current) =>
          current && String(current.id) === String(requestId) ? null : current
        );
        setCompletionOtp("");
        setStatus("AVAILABLE");
        loadWorkerProfile();
        loadHistory();
      }
    });

    socket.on("new-rating-received", () => {
      loadWorkerProfile();
      loadHistory();
      setMessage("You received a new customer rating.");
    });

    socket.on("request-cancelled", ({ requestId, message: text }) => {
      setRequests((current) =>
        current.filter((job) => String(job.id) !== String(requestId))
      );

      setAcceptedRequest((current) => {
        if (!current || String(current.id) !== String(requestId)) return current;
        setStatus("AVAILABLE");
        return null;
      });

      setMessage(text || "The customer cancelled this request.");
      loadActiveAssignment();
      loadRequests();
    });

    return () => socket.disconnect();
  }, [
    loadRequests,
    detectAndSaveLocation,
    loadActiveAssignment,
    loadWorkerProfile,
    loadHistory,
    loadPendingCooperativeRequests,
  ]);

  // Registration location is only used for cooperative discovery/joining.
  // Keep that refresh separate from the dashboard location effect so changes
  // to registrationLocation never trigger GPS detection or socket setup.
  useEffect(() => {
    loadCooperatives();
  }, [loadCooperatives]);

  useEffect(() => {
    if (
      acceptedRequest?.status === "WORK_COMPLETION_REQUESTED" &&
      acceptedRequest?.completion?.customerConfirmedAt
    ) {
      setCompletionVerificationOpen(true);
    }
  }, [acceptedRequest]);

  const acceptRequest = async (requestId) => {
    setProcessingId(requestId);
    try {
      const response = await api(`/worker-jobs/${requestId}/accept`, { method: "POST" });
      setAcceptedRequest(response.job ? normalizeJob(response.job) : null);
      setRequests((current) => current.filter((job) => String(job.id) !== String(requestId)));
      setStatus("BUSY");
      setMessage("Request accepted. You are now assigned to this customer.");
    } catch (error) {
      setRequests((current) => current.filter((job) => String(job.id) !== String(requestId)));
      setMessage(error.message || "This request is no longer available.");
      await loadRequests();
    } finally {
      setProcessingId(null);
    }
  };

  const startService = async () => {
    if (!acceptedRequest?.id) return;
    setCompletionBusy(true);
    try {
      const response = await api(`/worker-jobs/${acceptedRequest.id}/start`, { method: "POST" });
      setAcceptedRequest(response.job ? normalizeJob(response.job) : { ...acceptedRequest, status: "IN_PROGRESS" });
      setMessage("Service started. Complete the work before requesting customer confirmation.");
    } catch (error) {
      setMessage(error.message || "Unable to start this service.");
    } finally {
      setCompletionBusy(false);
    }
  };

  const requestCompletion = async () => {
    if (!acceptedRequest?.id) return;
    setCompletionBusy(true);
    try {
      const response = await api(`/worker-jobs/${acceptedRequest.id}/request-completion`, { method: "POST" });
      setAcceptedRequest(response.job ? normalizeJob(response.job) : { ...acceptedRequest, status: "WORK_COMPLETION_REQUESTED" });
      setCompletionOtp("");
      setCompletionVerificationOpen(false);
      setMessage("Completion request sent. Waiting for the customer to confirm the work.");
    } catch (error) {
      setMessage(error.message || "Unable to request completion.");
    } finally {
      setCompletionBusy(false);
    }
  };

  const verifyCompletion = async () => {
    if (!acceptedRequest?.id) return;
    const otp = completionOtp.trim();
    if (!/^\d{4}$/.test(otp)) {
      setMessage("Enter the 4-digit completion code provided by the customer.");
      return;
    }

    setCompletionBusy(true);
    try {
      await api(`/worker-jobs/${acceptedRequest.id}/verify-completion`, {
        method: "POST",
        body: JSON.stringify({ otp }),
      });
      setAcceptedRequest(null);
      setCompletionOtp("");
      setCompletionVerificationOpen(false);
      setStatus("AVAILABLE");
      setMessage("Service completed and verified successfully.");
      await Promise.all([loadWorkerProfile(), loadHistory(), loadRequests()]);
    } catch (error) {
      setMessage(error.message || "Unable to verify service completion.");
    } finally {
      setCompletionBusy(false);
    }
  };

  const rejectRequest = async (requestId) => {
    setProcessingId(requestId);
    try {
      await api(`/worker-jobs/${requestId}/reject`, { method: "POST" });
      setRequests((current) => current.filter((job) => String(job.id) !== String(requestId)));
      setMessage("Request rejected.");
    } catch (error) {
      setMessage(error.message || "This request is no longer available.");
    } finally {
      setProcessingId(null);
    }
  };

  const workerName = worker?.fullName || "Professional";
  const workerService =
    worker?.service ||
    (Array.isArray(worker?.skills) && worker.skills[0]?.service) ||
    "Skilled Professional";
  const workerLocation = getWorkerLocation(worker);
  const rating = Number(workerStats.averageRating);
  const hasRating = rating > 0;
  const completedJobs = Number(workerStats.totalJobsCompleted);
  const hasCompletedJobs = Number.isFinite(completedJobs);
  const totalRatings = Number(workerStats.totalRatings) || 0;
  const statusClass = statusStyles[status] || statusStyles.OFFLINE;

  return (
    <main className="min-h-screen bg-[#f6faf8] text-[#173b32]" style={{ "--sidebar-space": sidebarOpen ? "16rem" : "5rem" }}>
      <aside className={`fixed left-0 top-0 z-30 hidden h-screen border-r border-[#dcebe4] bg-white p-4 transition-[width] duration-200 lg:block ${sidebarOpen ? "w-64" : "w-20"}`}>
        <div className={`flex items-center border-b border-slate-100 pb-5 ${sidebarOpen ? "justify-between gap-3" : "justify-center"}`}>
          {sidebarOpen && <div className="flex items-center gap-3"><img src={logo} alt="Sahayog" className="h-10 w-10"/><div><p className="font-black text-[#12345b]">Sahayog</p><p className="text-xs text-slate-500">Worker</p></div></div>}
          <button type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#effaf4] hover:text-[#16845f]"><span className="sr-only">{sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}</span>{sidebarOpen ? <PanelLeftClose size={19}/> : <PanelLeftOpen size={19}/>}</button>
        </div>
        <nav className="mt-6 space-y-2">
          {[['dashboard','Dashboard',BriefcaseBusiness],['active','Active Job',CheckCircle2],['completed','Completed Jobs',CheckCircle2],['cancelled','Cancelled Jobs',Ban],['earnings','Earnings',WalletCards],['ratings','Ratings & Reviews',Star],['services','My Services',Wrench],['experience','Certifications',Award],['profile','Profile',UserRound]].map(([key,label,Icon]) => <button key={key} type="button" onClick={async () => { setSidebarPanel(key); if (key === 'completed') await loadAllCompletedJobs(); if (key === 'cancelled') await loadCancelledJobs(); window.scrollTo({top:0,behavior:'smooth'}); }} title={!sidebarOpen ? label : undefined} className={`flex w-full items-center rounded-xl py-3 text-sm font-extrabold transition ${sidebarOpen ? "gap-3 px-4" : "justify-center px-2"} ${sidebarPanel===key?'bg-[#effaf4] text-[#16845f]':'text-slate-600 hover:bg-slate-50'}`}><Icon size={18}/>{sidebarOpen && <span>{label}</span>}</button>)}
        </nav>
      </aside>
      <div className="fixed left-0 top-0 z-40 flex w-full items-center justify-between border-b border-[#dcebe4] bg-white px-4 py-3 lg:hidden"><div className="flex items-center gap-2"><Menu size={20} className="text-[#16845f]"/><span className="font-black text-[#12345b]">Worker Menu</span></div><select value={sidebarPanel} onChange={async (e)=>{setSidebarPanel(e.target.value); if(e.target.value==='completed') await loadAllCompletedJobs(); if(e.target.value==='cancelled') await loadCancelledJobs();}} className="rounded-lg border border-slate-200 px-2 py-2 text-sm font-bold"><option value="dashboard">Dashboard</option><option value="active">Active Job</option><option value="completed">Completed Jobs</option><option value="cancelled">Cancelled Jobs</option><option value="earnings">Earnings</option><option value="ratings">Ratings & Reviews</option><option value="services">My Services</option><option value="experience">Experience & Certifications</option><option value="profile">Profile</option></select></div>
      <header className="sticky top-0 z-20 border-b border-[#dcebe4] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center lg:pl-[var(--sidebar-space)] justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#effaf4]">
              <img src={logo} alt="Sahayog Logo" className="h-10 w-10 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-black tracking-tight text-[#12345b]">Sahayog</p>
              <p className="hidden truncate text-xs text-[#526b86] sm:block">
                Cooperative service network
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setLocationPopupOpen((value) => !value)}
                title="View and refresh your current work location"
                className="group flex min-w-0 max-w-[190px] items-center gap-2 rounded-xl border border-[#dcebe4] bg-white px-2.5 py-2 text-left transition hover:border-[#16845f] hover:bg-[#f5fbf8] sm:max-w-[300px] sm:px-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#effaf4] text-[#16845f]">
                  {locationLoading ? <LoaderCircle size={17} className="animate-spin" /> : <MapPin size={17} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#16845f] sm:text-[10px]">Your location</span>
                  <span className="block truncate text-xs font-semibold text-[#12345b] sm:text-sm">
                    {locationLoading ? "Detecting location..." : locationAddress}
                  </span>
                </span>
                <ChevronDown size={15} className={`hidden shrink-0 text-slate-400 transition-transform sm:block ${locationPopupOpen ? "rotate-180" : ""}`} />
              </button>
              {locationPopupOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[320px] max-w-[calc(100vw-32px)] rounded-2xl border border-[#dcebe4] bg-white p-5 shadow-2xl">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#effaf4] text-[#16845f]"><MapPin size={21} /></div>
                    <div>
                      <p className="text-sm font-extrabold text-[#12345b]">Current work location</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">This location is stored for nearby service-request matching.</p>
                    </div>
                  </div>
                  {location ? (
                    <div className="mt-4 rounded-xl bg-slate-50 p-4">
                      <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                        Current location
                      </p>
                      <div className="mt-2 flex items-start gap-2">
                        <MapPin size={16} className="mt-0.5 shrink-0 text-[#16845f]" />
                        <p className="text-sm font-bold leading-6 text-[#12345b]">
                          {locationAddress || "Location unavailable"}
                        </p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Your current location is used for nearby service-request matching.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                      Allow location access so Sahayog can match requests near your current position.
                    </div>
                  )}
                  <button type="button" onClick={() => detectAndSaveLocation()} disabled={locationLoading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16845f] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#11704f] disabled:opacity-60"><RefreshCw size={16} className={locationLoading ? "animate-spin" : ""} /> Refresh location</button>
                </div>
              )}
            </div>
            <div className="hidden text-right md:block">
              <p className="truncate text-sm font-bold text-[#12345b]">{workerName}</p>
              <p className="text-xs text-[#526b86]">Professional</p>
            </div>
            <ProfileAvatar src={worker?.profilePhoto} name={workerName} size="sm" />
            <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#16845f] hover:text-[#16845f]"><LogOut size={16} /><span className="hidden sm:inline">Logout</span></button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:pl-[var(--sidebar-space)] sm:px-6 sm:py-8 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-[#cfe7da] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="p-5 sm:p-7 lg:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <ProfileAvatar src={worker?.profilePhoto} name={workerName} size="xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#effaf4] px-3 py-1 text-xs font-black uppercase tracking-wide text-[#16845f]">
                      Worker profile
                    </span>
                    {worker?.cooperativeId && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-bold text-[#12345b]">
                        <ShieldCheck size={13} /> Cooperative member
                      </span>
                    )}
                  </div>
                  <h1 className="mt-3 break-words text-2xl font-black tracking-tight text-[#12345b] sm:text-3xl">
                    Welcome back, {workerName}
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-[#526b86]">{workerService}</p>
                  {cooperativeName && (
                    <p className="mt-1 text-sm font-bold text-[#16845f]">Cooperative: {cooperativeName}</p>
                  )}
                  {experienceCategory && (
                    <p className="mt-1 text-sm font-semibold text-[#526b86]">Experience category: {experienceCategory === "EXPERIENCED" ? "Experienced" : experienceCategory === "ANY" ? "Any" : "Pending admin classification"}</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {hasRating && (
                      <span className="inline-flex items-center gap-1.5 font-bold text-[#12345b]">
                        <Star size={16} className="fill-current text-amber-500" />
                        {rating.toFixed(1)} rating
                      </span>
                    )}
                    {hasCompletedJobs && (
                      <span className="font-semibold text-[#526b86]">
                        {completedJobs} completed {completedJobs === 1 ? "job" : "jobs"}
                      </span>
                    )}
                    {workerLocation && (
                      <span className="inline-flex items-center gap-1 font-semibold text-[#526b86]">
                        <MapPin size={15} /> {workerLocation}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4 bg-[#effaf4] p-5 sm:p-7">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#526b86]">
                  Availability
                </p>
                <div className={`mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-extrabold ${statusClass}`}>
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {status}
                </div>
              </div>
              <p className="text-xs leading-5 text-[#526b86]">
                Set yourself to AVAILABLE when you are ready to receive nearby service requests.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Completed Jobs", hasCompletedJobs ? completedJobs : null, BriefcaseBusiness],
            ["Average Rating", hasRating ? rating.toFixed(1) : null, Star],
            ["Customer Ratings", totalRatings, Star],
            ["Current Status", status, CheckCircle2],
            ["Nearby Requests", requests.length, MapPin],
          ].map(([label, value, Icon]) => (
            <div key={label} className="rounded-2xl border border-[#dcebe4] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#526b86]">{label}</p>
                  <p className="mt-2 text-xl font-black text-[#12345b]">
                    {value === null || value === undefined || value === "" ? "—" : value}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#effaf4] text-[#16845f]">
                  <Icon size={18} />
                </div>
              </div>
            </div>
          ))}
        </section>

        {message && (
          <div className="mt-5 rounded-2xl border border-[#cfe7da] bg-[#effaf4] p-4 text-sm font-semibold text-[#12345b]" role="status">
            {message}
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-[2rem] border border-[#dcebe4] bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold text-[#16845f]">Requests for you</p>
                <h2 className="mt-1 text-2xl font-black text-[#12345b]">New service requests</h2>
                <p className="mt-1 text-sm text-[#526b86]">
                  Available requests matched to your service and the 10 km Sahayog network.
                </p>
              </div>
              <button
                onClick={refreshAll}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-[#16845f] hover:text-[#16845f] disabled:opacity-60 sm:w-auto"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {requests.length ? requests.map((request) => (
                <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-[#b9dcca] hover:shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <span className="inline-flex rounded-full bg-[#effaf4] px-3 py-1 text-xs font-extrabold text-[#16845f]">{request.service}</span>
                      <h3 className="mt-3 text-lg font-black text-[#12345b]">Service request</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{request.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#effaf4] px-3 py-1 text-xs font-extrabold text-[#16845f]">
                          {request.experiencePreference === "EXPERIENCED" ? "Experienced request" : "Any professional request"}
                        </span>
                        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-extrabold text-[#12345b]">
                          ₹{Number(request.amount || 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                      {request.customer?.name && (
                        <p className="mt-3 text-sm font-bold text-[#12345b]">Customer: {request.customer.name}</p>
                      )}
                    </div>
                    <div className="shrink-0 rounded-xl bg-[#f7faf8] px-4 py-3 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 text-[#16845f]" size={16} />
                        <div>
                          <p className="max-w-[240px] break-words font-bold text-[#12345b]">{request.location?.formatted || "Location unavailable"}</p>
                          {request.distanceKm != null && (
                            <p className="mt-1 text-xs font-semibold text-[#526b86]">{Number(request.distanceKm).toFixed(1)} km away</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      disabled={processingId === request.id || status !== "AVAILABLE"}
                      onClick={() => acceptRequest(request.id)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#16845f] px-4 py-3 font-extrabold text-white hover:bg-[#11704f] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 size={17} />
                      {processingId === request.id ? "Processing..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={processingId === request.id}
                      onClick={() => rejectRequest(request.id)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 font-extrabold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle size={17} /> Reject
                    </button>
                  </div>
                </article>
              )) : (
                <div className="rounded-2xl bg-[#f7faf8] p-10 text-center">
                  <BriefcaseBusiness className="mx-auto text-[#16845f]" size={30} />
                  <p className="mt-3 font-extrabold text-[#12345b]">No new requests</p>
                  <p className="mt-1 text-sm text-[#526b86]">Stay available to receive nearby service requests.</p>
                </div>
              )}
            </div>
          </section>

            <aside className="space-y-5">
            {acceptedRequest && (
              <section className="rounded-[2rem] border border-[#cfe7da] bg-[#effaf4] p-6 shadow-sm">
                <p className="text-sm font-bold text-[#16845f]">Current assignment</p>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="mt-1 text-xl font-black text-[#12345b]">{acceptedRequest.service}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{acceptedRequest.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#16845f]">
                        {acceptedRequest.experiencePreference === "EXPERIENCED" ? "Experienced" : "Any"}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#12345b]">
                        ₹{Number(acceptedRequest.amount || 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#16845f]">{acceptedRequest.status}</span>
                </div>
                <div className="mt-4 rounded-2xl bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Customer</p>
                  <p className="mt-1 font-extrabold text-[#12345b]">{acceptedRequest.customer?.name || "Customer"}</p>
                  {acceptedRequest.customer?.phone && (
                    <p className="mt-2 text-sm font-semibold text-slate-600">Contact: {acceptedRequest.customer.phone}</p>
                  )}
                  <div className="mt-3 flex items-start gap-2">
                    <MapPin className="mt-0.5 text-[#16845f]" size={16} />
                    <p className="break-words text-sm font-semibold text-[#12345b]">{acceptedRequest.location?.formatted || "Location unavailable"}</p>
                  </div>
                </div>

                {acceptedRequest.status === "ASSIGNED" && (
                  <button type="button" disabled={completionBusy} onClick={startService} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16845f] px-4 py-3 font-extrabold text-white hover:bg-[#11704f] disabled:opacity-50">
                    <CheckCircle2 size={17} /> {completionBusy ? "Starting..." : "Start Service"}
                  </button>
                )}

                {acceptedRequest.status === "IN_PROGRESS" && (
                  <button type="button" disabled={completionBusy} onClick={requestCompletion} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16845f] px-4 py-3 font-extrabold text-white hover:bg-[#11704f] disabled:opacity-50">
                    <CheckCircle2 size={17} /> {completionBusy ? "Sending..." : "Mark Work as Completed"}
                  </button>
                )}

                {acceptedRequest.status === "CUSTOMER_DISPUTED" && (
                  <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
                    <p className="font-extrabold text-[#12345b]">Customer reported a problem</p>
                    <p className="mt-1 text-sm text-slate-600">The job is not completed. Resolve the issue before any future completion verification.</p>
                  </div>
                )}
              </section>
            )}

            <section className="rounded-[2rem] border border-[#dcebe4] bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Users className="text-[#16845f]" size={18} />
                <h2 className="text-lg font-black text-[#12345b]">Cooperative</h2>
              </div>
              {worker?.cooperativeId ? (
                <div className="mt-4 rounded-xl bg-[#effaf4] p-4">
                  <p className="text-sm font-bold text-[#16845f]">{cooperativeName || "Associated with a cooperative"}</p>
                  <p className="mt-1 text-xs text-[#526b86]">Your cooperative can manage your work status and assignments.</p>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-6 text-[#526b86]">Join an active cooperative to participate in the cooperative worker network.</p>
                  {cooperativeMessage && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">{cooperativeMessage}</div>}
                  <div className="mt-4 space-y-3">
                    {cooperatives.length ? cooperatives.map((cooperative) => (
                      <div key={cooperative._id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-[#12345b]">{cooperative.name}</p>
                            <p className="mt-1 text-xs text-[#526b86]">{cooperative.type || "Labour Cooperative"}</p>
                            {Number.isFinite(Number(cooperative.distanceKm)) && (
                              <p className="mt-1 text-[11px] font-bold text-[#16845f]">{cooperative.distanceKm} km from your registration area</p>
                            )}
                          </div>
                          <span className="text-xs font-bold text-[#16845f]">{cooperative.availableSlots} slots</span>
                        </div>
                        {pendingCooperativeIds.has(String(cooperative._id)) ? (
                          <button type="button" disabled className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#16845f] cursor-not-allowed">
                            Requested
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={joiningCooperativeId === cooperative._id}
                            onClick={() => joinCooperative(cooperative._id)}
                            className="mt-3 w-full rounded-lg bg-[#16845f] px-3 py-2 text-xs font-bold text-white hover:bg-[#11704f] disabled:opacity-50"
                          >
                            {joiningCooperativeId === cooperative._id ? "Sending..." : "Request to Join"}
                          </button>
                        )}
                      </div>
                    )) : <p className="text-sm text-[#526b86]">No active cooperatives available right now.</p>}
                  </div>
                </>
              )}
            </section>

            <section className="rounded-[2rem] border border-[#dcebe4] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Star className="text-amber-500" size={18} /><h2 className="text-lg font-black text-[#12345b]">Completed services</h2></div>
                <span className="text-xs font-bold text-[#526b86]">{history.length > 5 ? 5 : history.length} shown</span>
              </div>
              <div className="mt-4 space-y-3">
                {history.length ? history.slice(0, 5).map((job) => (
                  <div key={job.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[#12345b]">{job.service}</p>
                      {job.rating ? (
                        <span className="inline-flex items-center gap-1 text-xs font-black text-amber-600">★ {job.rating.rating}</span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">Awaiting review</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[#526b86]">Customer: {job.customer?.name || "Customer"}</p>
                    {job.rating?.review && <p className="mt-2 text-xs leading-5 text-slate-600">“{job.rating.review}”</p>}
                  </div>
                )) : <p className="text-sm text-[#526b86]">No completed services yet.</p>}
              </div>
              <button
                type="button"
                onClick={async () => {
                  setCompletedJobsOpen(true);
                  await loadAllCompletedJobs();
                }}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#cfe7da] bg-[#effaf4] px-4 py-3 text-sm font-extrabold text-[#16845f] hover:bg-[#e5f6ed]"
              >
                View All Completed Jobs
              </button>
            </section>


          </aside>
        </div>

        {sidebarPanel !== "dashboard" && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[#16845f]">Worker workspace</p><h2 className="text-2xl font-black text-[#12345b]">{({active:'Active Job',completed:'Completed Jobs',cancelled:'Cancelled Jobs',earnings:'Earnings',ratings:'Ratings & Reviews',services:'My Services',experience:'Experience & Certifications',profile:'Profile'})[sidebarPanel]}</h2></div><button onClick={()=>setSidebarPanel('dashboard')} className="rounded-xl border px-3 py-2 font-bold">Close</button></div>
              {sidebarPanel === 'active' && (acceptedRequest ? <div className="mt-6 rounded-2xl border border-[#cfe7da] bg-[#effaf4] p-6"><p className="text-sm font-bold text-[#16845f]">Current assignment</p><h3 className="mt-2 text-xl font-black text-[#12345b]">{acceptedRequest.service}</h3><p className="mt-2 text-sm text-slate-600">Customer: {acceptedRequest.customer?.name || 'Customer'}</p><p className="mt-2 text-sm text-slate-600">{acceptedRequest.description}</p><p className="mt-4 font-black text-[#12345b]">₹{Number(acceptedRequest.amount || 0).toLocaleString('en-IN')}</p></div> : <p className="py-12 text-center text-slate-500">No active job right now.</p>)}
              {sidebarPanel === 'completed' && <div className="mt-6 space-y-3">{allCompletedJobs.length ? allCompletedJobs.map((job)=><div key={job.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><p className="font-black text-[#12345b]">{job.service}</p><span className="font-bold text-[#16845f]">₹{Number(job.amount||0).toLocaleString('en-IN')}</span></div><p className="mt-2 text-sm text-slate-600">Customer: {job.customer?.name || 'Customer'}</p><p className="mt-1 text-xs text-slate-400">{job.updatedAt ? new Date(job.updatedAt).toLocaleString() : ''}</p></div>) : <p className="py-12 text-center text-slate-500">No completed jobs yet.</p>}</div>}
              {sidebarPanel === 'cancelled' && <div className="mt-6 space-y-3">{cancelledJobs.length ? cancelledJobs.map((job)=><div key={job.id} className="rounded-2xl border border-red-100 bg-red-50 p-5"><p className="font-black text-[#12345b]">{job.service}</p><p className="mt-2 text-sm text-slate-600">{job.description}</p><p className="mt-1 text-xs font-bold text-red-600">Cancelled</p></div>) : <p className="py-12 text-center text-slate-500">No cancelled jobs found.</p>}</div>}
              {sidebarPanel === 'earnings' && <div className="mt-6"><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-[#effaf4] p-5"><p className="text-xs font-bold text-slate-500">Total earnings</p><p className="mt-2 text-3xl font-black text-[#12345b]">₹{history.filter(j=>j.status==='COMPLETED').reduce((sum,j)=>sum+Number(j.amount||0),0).toLocaleString('en-IN')}</p></div><div className="rounded-2xl bg-slate-50 p-5"><p className="text-xs font-bold text-slate-500">Completed jobs</p><p className="mt-2 text-3xl font-black text-[#12345b]">{completedJobs}</p></div><div className="rounded-2xl bg-slate-50 p-5"><p className="text-xs font-bold text-slate-500">Average rating</p><p className="mt-2 text-3xl font-black text-[#12345b]">★ {rating.toFixed(1)}</p></div></div><p className="mt-4 text-sm text-slate-500">Earnings are calculated only from verified completed jobs returned by the existing job history.</p></div>}
              {sidebarPanel === 'ratings' && <div className="mt-6"><div className="rounded-2xl bg-[#effaf4] p-6"><p className="text-sm font-bold text-[#16845f]">Average rating</p><p className="mt-1 text-4xl font-black text-[#12345b]">★ {rating.toFixed(1)}</p><p className="mt-1 text-sm text-slate-500">{totalRatings} customer ratings</p></div><div className="mt-4 space-y-3">{history.filter(j=>j.rating).map(j=><div key={j.id} className="rounded-xl border border-slate-200 p-4"><p className="font-bold text-[#12345b]">{j.customer?.name || 'Customer'} · ★ {j.rating.rating}</p><p className="mt-1 text-sm text-slate-600">{j.rating.review || 'No written review.'}</p></div>)}</div></div>}
              {sidebarPanel === 'services' && <div className="mt-6 rounded-2xl border border-slate-200 p-6"><p className="font-black text-[#12345b]">Your services and skills</p><div className="mt-4 flex flex-wrap gap-2">{(worker?.skills || []).map((skill,i)=><span key={i} className="rounded-full bg-[#effaf4] px-3 py-2 text-sm font-bold text-[#16845f]">{skill.service} · {skill.experienceYears} yrs</span>)}{worker?.service && !(worker?.skills||[]).length && <span className="rounded-full bg-[#effaf4] px-3 py-2 text-sm font-bold text-[#16845f]">{worker.service}</span>}</div></div>}
              {sidebarPanel === 'experience' && <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-5"><p className="text-xs font-bold text-slate-400">Admin classification</p><p className="mt-2 text-xl font-black text-[#12345b]">{experienceCategory}</p><p className="mt-2 text-xs text-slate-500">This category is controlled by the cooperative admin.</p></div><div className="rounded-2xl bg-slate-50 p-5"><p className="text-xs font-bold text-slate-400">Experience</p><p className="mt-2 text-xl font-black text-[#12345b]">{worker?.experienceYears || 0} years</p></div></div>}
              {sidebarPanel === 'profile' && <div className="mt-6 grid gap-4 sm:grid-cols-2">{[['Name',workerName],['Email',worker?.email],['Phone',worker?.phone],['Cooperative',cooperativeName || 'Not assigned'],['Rating',rating.toFixed(1)],['Completed jobs',completedJobs]].map(([k,v])=><div key={k} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-400">{k}</p><p className="mt-1 font-black text-[#12345b]">{v || 'Not provided'}</p></div>)}</div>}
            </div>
          </div>
        )}

        {completionVerificationOpen && acceptedRequest?.status === "WORK_COMPLETION_REQUESTED" && acceptedRequest?.completion?.customerConfirmedAt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="completion-verification-title">
            <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#effaf4] px-3 py-1 text-xs font-black text-[#16845f]">
                    <ShieldCheck size={14} /> Customer approved
                  </div>
                  <h3 id="completion-verification-title" className="mt-3 text-2xl font-black text-[#12345b]">Complete Service</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">The customer has confirmed the completed work. Enter the 4-digit verification code provided by the customer.</p>
                </div>
                <button type="button" onClick={() => setCompletionVerificationOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50" aria-label="Close verification popup">Close</button>
              </div>
              <input autoFocus value={completionOtp} onChange={(event) => setCompletionOtp(event.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={(event) => { if (event.key === "Enter") verifyCompletion(); }} inputMode="numeric" maxLength={4} pattern="[0-9]*" placeholder="_ _ _ _" aria-label="4-digit verification code" className="mt-6 w-full rounded-2xl border border-slate-200 px-4 py-4 text-center text-3xl font-black tracking-[0.45em] text-[#12345b] outline-none focus:border-[#16845f] focus:ring-4 focus:ring-[#16845f]/10" />
              <p className="mt-2 text-center text-xs text-slate-500">Only the customer-provided code can complete this service.</p>
              <button type="button" disabled={completionBusy || completionOtp.length !== 4} onClick={verifyCompletion} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16845f] px-4 py-3.5 font-extrabold text-white hover:bg-[#11704f] disabled:cursor-not-allowed disabled:opacity-50">
                <ShieldCheck size={18} /> {completionBusy ? "Verifying..." : "Verify Code"}
              </button>
              {message && /invalid|expired|verification|customer has not confirmed|unable to verify/i.test(message) && (
                <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600" role="alert">{message}</p>
              )}
            </div>
          </div>
        )}

        {completedJobsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="All completed jobs">
            <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-sm font-bold text-[#16845f]">Completed services</p>
                  <h2 className="mt-1 text-2xl font-black text-[#12345b]">All Completed Jobs</h2>
                </div>
                <button type="button" onClick={() => setCompletedJobsOpen(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:border-[#16845f] hover:text-[#16845f]">
                  <XCircle size={20} />
                </button>
              </div>
              <div className="max-h-[65vh] overflow-y-auto p-6">
                {allCompletedJobs.length ? (
                  <div className="space-y-3">
                    {allCompletedJobs.map((job) => (
                      <article key={job.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-[#12345b]">{job.service}</p>
                            <p className="mt-1 text-sm text-slate-600">Customer: {job.customer?.name || "Customer"}</p>
                            <p className="mt-1 text-xs text-slate-400">{job.updatedAt ? new Date(job.updatedAt).toLocaleString() : ""}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-extrabold text-[#16845f]">Completed</p>
                            {job.rating ? <p className="mt-1 text-xs font-bold text-amber-600">★ {job.rating.rating}/5</p> : <p className="mt-1 text-xs text-slate-400">Awaiting customer rating</p>}
                          </div>
                        </div>
                        {job.amount ? <p className="mt-3 text-sm font-bold text-[#12345b]">Amount: ₹{Number(job.amount).toLocaleString("en-IN")}</p> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-[#f7faf8] p-10 text-center">
                    <BriefcaseBusiness className="mx-auto text-[#16845f]" size={30} />
                    <p className="mt-3 font-extrabold text-[#12345b]">No completed jobs yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2 text-xs text-slate-400">
          <span className={`h-2 w-2 rounded-full ${socketConnected ? "bg-[#16845f]" : "bg-slate-300"}`} />
          {socketConnected ? "Live updates connected" : "Live updates reconnecting"}
        </div>
      </div>
    </main>
  );
}
