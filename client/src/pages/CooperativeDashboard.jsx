import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock3, LogOut, RefreshCw, UserRound, Users, XCircle, LayoutDashboard, Search, ClipboardList, BarChart3, Settings, Menu, PanelLeftClose, PanelLeftOpen, ShieldAlert, ShieldCheck, WifiOff, Star, BriefcaseBusiness, Save, Phone, Mail, MapPin, FileText } from "lucide-react";
import { api } from "../lib/api";
import logo from "../assets/logo.png";
import ProfileAvatar from "../components/ProfileAvatar";

const statusStyles = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  BUSY: "bg-amber-50 text-amber-700 border-amber-200",
  OFFLINE: "bg-slate-100 text-slate-600 border-slate-200",
  SUSPENDED: "bg-red-50 text-red-700 border-red-200",
};

const requestStatusStyles = {
  REQUESTED: "bg-blue-50 text-blue-700 border-blue-200",
  ASSIGNED: "bg-violet-50 text-violet-700 border-violet-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
  WORK_COMPLETION_REQUESTED: "bg-orange-50 text-orange-700 border-orange-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
};

const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";
const customerName = (customer) => customer?.fullName || customer?.fullname || "Customer";

export default function CooperativeDashboard({ admin, onLogout }) {
  const [dashboard, setDashboard] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [reports, setReports] = useState(null);
  const [settings, setSettings] = useState(null);
  const [profile, setProfile] = useState(null);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarPanel, setSidebarPanel] = useState("dashboard");
  const [modalOpen, setModalOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardResponse, workersResponse, requestsResponse] = await Promise.all([
        api("/cooperative-admin/dashboard"),
        api("/cooperative-admin/workers"),
        api("/cooperative-admin/join-requests"),
      ]);
      setDashboard(dashboardResponse.data);
      setWorkers(workersResponse.data?.workers || []);
      setRequests(requestsResponse.data || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Unable to load cooperative dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const loadPanel = useCallback(async (key) => {
    setPanelLoading(true);
    try {
      if (key === "requests") {
        const response = await api("/cooperative-admin/service-requests");
        setServiceRequests(response.data?.requests || []);
      } else if (key === "reports") {
        const response = await api("/cooperative-admin/reports");
        setReports(response.data || null);
      } else if (key === "settings") {
        const response = await api("/cooperative-admin/settings");
        setSettings(response.data?.cooperative || null);
      } else if (key === "profile") {
        const response = await api("/cooperative-admin/profile");
        setProfile(response.data?.admin || null);
      }
      setMessage("");
    } catch (error) {
      setMessage(error.message || `Unable to load ${key}.`);
    } finally {
      setPanelLoading(false);
    }
  }, []);

  const handleSidebarNavigation = (key) => {
    setSidebarPanel(key);
    if (key === "dashboard") {
      setModalOpen(false);
      setMessage("");
      return;
    }
    setModalOpen(true);
    setMessage("");
    if (key === "requests" || key === "reports" || key === "settings" || key === "profile") {
      loadPanel(key);
    }
    if (key === "search") {
      setSearchResult(null);
      setSearchPhone("");
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setMessage("");
  };

  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen]);

  const reviewRequest = async (requestId, action) => {
    setProcessingId(requestId);
    try {
      if (action === "accept") {
        await api(`/cooperative-admin/join-requests/${requestId}/accept`, { method: "PATCH" });
      } else {
        const reason = window.prompt("Enter rejection reason:", "Not suitable for current cooperative requirements");
        if (!reason?.trim()) return;
        await api(`/cooperative-admin/join-requests/${requestId}/reject`, { method: "PATCH", body: JSON.stringify({ rejectionReason: reason }) });
      }
      setMessage(action === "accept" ? "Worker accepted and added to your cooperative." : "Worker join request rejected.");
      await loadDashboard();
    } catch (error) {
      setMessage(error.message || "Unable to process join request.");
    } finally {
      setProcessingId(null);
    }
  };

  const changeWorkerStatus = async (workerId, status) => {
    setProcessingId(workerId);
    try {
      await api(`/cooperative-admin/workers/${workerId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage(status === "SUSPENDED" ? "Worker suspended successfully." : "Worker restored successfully.");
      await loadDashboard();
      if (searchResult?._id === workerId) {
        const response = await api(`/cooperative-admin/search-worker?phone=${encodeURIComponent(searchResult.phone)}`);
        setSearchResult(response.data?.worker || null);
      }
    } catch (error) {
      setMessage(error.message || "Unable to update worker administrative status.");
    } finally {
      setProcessingId(null);
    }
  };

  const changeWorkerExperienceCategory = async (workerId, experienceCategory) => {
    setProcessingId(workerId);
    try {
      await api(`/cooperative-admin/workers/${workerId}/experience-category`, { method: "PATCH", body: JSON.stringify({ experienceCategory }) });
      setMessage("Worker experience category updated.");
      await loadDashboard();
    } catch (error) {
      setMessage(error.message || "Unable to update worker experience category.");
    } finally {
      setProcessingId(null);
    }
  };

  const searchWorker = async (event) => {
    event.preventDefault();
    const phone = searchPhone.replace(/\s+/g, "");
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setMessage("Please enter a valid 10-digit Indian worker phone number.");
      setSearchResult(null);
      return;
    }
    setPanelLoading(true);
    setMessage("");
    try {
      const response = await api(`/cooperative-admin/search-worker?phone=${encodeURIComponent(phone)}`);
      setSearchResult(response.data?.worker || null);
    } catch (error) {
      setSearchResult(null);
      setMessage(error.message || "Worker not found in your cooperative.");
    } finally {
      setPanelLoading(false);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setPanelLoading(true);
    try {
      const response = await api("/cooperative-admin/settings", { method: "PATCH", body: JSON.stringify(settings) });
      setSettings(response.data?.cooperative || settings);
      await loadDashboard();
      setMessage("Cooperative settings updated successfully.");
    } catch (error) {
      setMessage(error.message || "Unable to save cooperative settings.");
    } finally {
      setPanelLoading(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setPanelLoading(true);
    try {
      const response = await api("/cooperative-admin/profile", { method: "PATCH", body: JSON.stringify({ fullName: profile.fullName, phone: profile.phone }) });
      setProfile(response.data?.admin || profile);
      setMessage("Profile updated successfully.");
    } catch (error) {
      setMessage(error.message || "Unable to save profile.");
    } finally {
      setPanelLoading(false);
    }
  };

  const stats = dashboard?.stats || {};
  const cooperative = dashboard?.cooperative || {};
  const sidebarItems = useMemo(() => [
    ["dashboard", "Dashboard", LayoutDashboard], ["search", "Search Worker", Search], ["workers", "Workers", Users], ["requests", "Service Requests", ClipboardList], ["summary", "Summary", Building2], ["reports", "Reports & Analytics", BarChart3], ["settings", "Cooperative Settings", Settings], ["profile", "Profile", UserRound],
  ], []);

  const summaryCards = [
    ["Total Workers", stats.totalWorkers, Users], ["Available", stats.availableWorkers, CheckCircle2], ["Busy", stats.busyWorkers, Clock3], ["Offline", stats.offlineWorkers, WifiOff], ["Suspended", stats.suspendedWorkers, ShieldAlert], ["Active Requests", stats.activeRequests, BriefcaseBusiness], ["Completed Services", stats.completedJobs, CheckCircle2], ["Average Rating", Number(stats.averageRating || 0).toFixed(1), Star],
  ];

  const renderModalContent = () => {
    if (sidebarPanel === "search") {
      return <>
        <ModalHeader icon={Search} title="Search Worker" subtitle="Find a worker by phone number" onClose={closeModal}/>
        <form onSubmit={searchWorker} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input value={searchPhone} onChange={(e) => setSearchPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} inputMode="numeric" maxLength={10} placeholder="10-digit worker phone number" className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-[#16845f]" autoFocus/>
          <button disabled={panelLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#16845f] px-5 py-3 font-bold text-white disabled:opacity-60"><Search size={17}/>{panelLoading ? "Searching..." : "Search Worker"}</button>
        </form>
        {message && <InlineMessage text={message}/>} 
        <div className="mt-5">
          {searchResult ? <WorkerCard worker={searchResult} processingId={processingId} onStatus={changeWorkerStatus} onExperience={changeWorkerExperienceCategory}/> : <EmptyState icon={Search} title="Search a cooperative worker" text="Enter the worker's registered 10-digit phone number to view details available to your cooperative."/>}
        </div>
      </>;
    }

    if (sidebarPanel === "workers") {
      return <>
        <ModalHeader icon={Users} title="Workers" subtitle="Cooperative workers" onClose={closeModal}/>
        <div className="mt-6">
          {loading ? <LoadingText text="Loading workers..."/> : workers.length ? <div className="grid gap-4 lg:grid-cols-2">{workers.map((worker) => <WorkerCard key={worker._id} worker={worker} processingId={processingId} onStatus={changeWorkerStatus} onExperience={changeWorkerExperienceCategory}/>)}</div> : <EmptyState icon={Users} title="No workers yet" text="Accept worker join requests to build your cooperative."/>}
        </div>
      </>;
    }

    if (sidebarPanel === "summary") {
      return <>
        <ModalHeader icon={Building2} title="Cooperative Summary" subtitle="Current cooperative performance" onClose={closeModal}/>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{summaryCards.map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-[#e0ebe6] bg-[#f7faf8] p-5"><Icon className="text-[#16845f]" size={20}/><p className="mt-3 text-sm font-semibold text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-[#12345b]">{value ?? 0}</p></div>)}</div>
      </>;
    }

    if (sidebarPanel === "requests") {
      return <>
        <ModalHeader icon={ClipboardList} title="Service Requests" subtitle="Requests assigned to workers in your cooperative" onClose={closeModal}/>
        <div className="mt-6">{panelLoading ? <LoadingText text="Loading service requests..."/> : serviceRequests.length ? <div className="space-y-3">{serviceRequests.map((request) => <article key={request._id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-[#12345b]">{request.service}</p><p className="mt-1 text-sm text-slate-500">{customerName(request.customerId)} • {formatDate(request.createdAt)}</p><p className="mt-2 text-sm text-slate-600">{request.description || "No description provided."}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${requestStatusStyles[request.status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>{request.status}</span></div><div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-500"><span>Worker: {request.assignedWorkerId?.fullName || "—"}</span><span>Amount: ₹{request.amount ?? "—"}</span><span>Preference: {request.experiencePreference || "ANY"}</span></div></article>)}</div> : <EmptyState icon={ClipboardList} title="No cooperative service requests" text="Requests assigned to your cooperative workers will appear here."/>}</div>
      </>;
    }

    if (sidebarPanel === "reports") {
      return <>
        <ModalHeader icon={BarChart3} title="Reports & Analytics" subtitle="Analytics calculated from cooperative service data" onClose={closeModal}/>
        <div className="mt-6">{panelLoading ? <LoadingText text="Loading reports..."/> : reports ? <div className="grid gap-5 lg:grid-cols-3"><ReportList title="Request status" rows={reports.statusBreakdown} label={(row) => row._id}/><ReportList title="Service demand" rows={reports.serviceDemand} label={(row) => row._id}/><div className="rounded-2xl bg-[#f7faf8] p-5"><p className="font-black text-[#12345b]">Recent monthly activity</p><div className="mt-4 space-y-3">{reports.monthlyActivity?.length ? reports.monthlyActivity.map((row) => <div key={`${row._id.year}-${row._id.month}`} className="flex items-center justify-between text-sm"><span className="font-semibold text-slate-600">{row._id.month}/{row._id.year}</span><span className="font-bold text-[#12345b]">{row.count} requests</span></div>) : <p className="text-sm text-slate-500">No activity data available.</p>}</div></div></div> : <EmptyState icon={BarChart3} title="No analytics available" text="There is no report data available for this cooperative yet."/>}</div>
      </>;
    }

    if (sidebarPanel === "settings") {
      return <>
        <ModalHeader icon={Settings} title="Cooperative Settings" subtitle="Edit supported cooperative configuration" onClose={closeModal}/>
        <div className="mt-6">{panelLoading ? <LoadingText text="Loading settings..."/> : settings ? <form onSubmit={saveSettings} className="grid gap-4 sm:grid-cols-2"><Field label="Cooperative name" value={settings.name} onChange={(v) => setSettings({...settings, name:v})}/><Field label="Maximum workers" type="number" value={settings.maxWorkers} onChange={(v) => setSettings({...settings, maxWorkers:v})}/><Field label="Contact phone" value={settings.contact?.phone || ""} onChange={(v) => setSettings({...settings, contact:{...settings.contact, phone:v}})}/><Field label="Contact email" type="email" value={settings.contact?.email || ""} onChange={(v) => setSettings({...settings, contact:{...settings.contact, email:v}})}/><Field label="Area" value={settings.address?.area || ""} onChange={(v) => setSettings({...settings, address:{...settings.address, area:v}})}/><Field label="City" value={settings.address?.city || ""} onChange={(v) => setSettings({...settings, address:{...settings.address, city:v}})}/><Field label="State" value={settings.address?.state || ""} onChange={(v) => setSettings({...settings, address:{...settings.address, state:v}})}/><Field label="Pincode" value={settings.address?.pincode || ""} onChange={(v) => setSettings({...settings, address:{...settings.address, pincode:v}})}/><label className="sm:col-span-2"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Description</span><textarea value={settings.description || ""} onChange={(e) => setSettings({...settings, description:e.target.value})} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-[#16845f]"/></label><div className="flex flex-wrap gap-5 sm:col-span-2"><Toggle label="Emergency service enabled" checked={!!settings.emergencyServiceEnabled} onChange={(v)=>setSettings({...settings, emergencyServiceEnabled:v})}/><Toggle label="Demand forecasting enabled" checked={!!settings.demandForecastEnabled} onChange={(v)=>setSettings({...settings, demandForecastEnabled:v})}/></div><div className="sm:col-span-2"><button disabled={panelLoading} className="inline-flex items-center gap-2 rounded-xl bg-[#16845f] px-5 py-3 font-bold text-white disabled:opacity-60"><Save size={17}/>{panelLoading ? "Saving..." : "Save Settings"}</button></div></form> : <EmptyState icon={Settings} title="Unable to load settings" text="Please close this popup and try again."/>}</div>
      </>;
    }

    if (sidebarPanel === "profile") {
      return <>
        <ModalHeader icon={UserRound} title="Profile" subtitle="Manage the authenticated cooperative administrator profile" onClose={closeModal}/>
        <div className="mt-6">{panelLoading ? <LoadingText text="Loading profile..."/> : profile ? <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center gap-4 rounded-2xl bg-[#f7faf8] p-4">
            <ProfileAvatar src={profile.profilePhoto} name={profile.fullName} size="lg" />
            <div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Profile photo</p><p className="mt-1 text-sm font-semibold text-slate-600">Your owner profile photo is shown across the cooperative dashboard.</p></div>
          </div><Field label="Full name" value={profile.fullName || ""} onChange={(v)=>setProfile({...profile, fullName:v})}/><Field label="Phone" value={profile.phone || ""} onChange={(v)=>setProfile({...profile, phone:v})}/><div className="rounded-xl bg-[#f7faf8] p-4"><p className="text-xs font-black uppercase text-slate-400">Email</p><p className="mt-1 font-bold text-[#12345b]">{profile.email || "—"}</p></div><div className="rounded-xl bg-[#f7faf8] p-4"><p className="text-xs font-black uppercase text-slate-400">Cooperative</p><p className="mt-1 font-bold text-[#12345b]">{profile.cooperativeId?.name || cooperative.name || "—"}</p></div><div className="sm:col-span-2"><button disabled={panelLoading} className="inline-flex items-center gap-2 rounded-xl bg-[#16845f] px-5 py-3 font-bold text-white disabled:opacity-60"><Save size={17}/>{panelLoading ? "Saving..." : "Save Profile"}</button></div></form> : <EmptyState icon={UserRound} title="Unable to load profile" text="Please close this popup and try again."/>}</div>
      </>;
    }
    return null;
  };

  return (
    <main className="min-h-screen bg-[#f6faf8] text-[#173b32]" style={{ "--sidebar-space": sidebarOpen ? "16rem" : "5rem" }}>
      <aside className={`fixed left-0 top-0 z-30 hidden h-screen border-r border-[#dcebe4] bg-white p-4 transition-[width] duration-200 lg:block ${sidebarOpen ? "w-64" : "w-20"}`}>
        <div className={`flex items-center border-b border-slate-100 pb-5 ${sidebarOpen ? "justify-between gap-3" : "justify-center"}`}>
          {sidebarOpen && <div className="flex items-center gap-3"><img src={logo} alt="Sahayog" className="h-10 w-10 object-contain"/><div><p className="font-black text-[#12345b]">Sahayog</p><p className="text-xs text-slate-500">Cooperative Owner</p></div></div>}
          <button type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[#effaf4] hover:text-[#16845f]">{sidebarOpen ? <PanelLeftClose size={19}/> : <PanelLeftOpen size={19}/>}</button>
        </div>
        <nav className="mt-6 space-y-2">{sidebarItems.map(([key, label, Icon]) => <button key={key} type="button" onClick={() => handleSidebarNavigation(key)} title={!sidebarOpen ? label : undefined} className={`flex w-full items-center rounded-xl py-3 text-sm font-extrabold transition ${sidebarOpen ? "gap-3 px-4" : "justify-center px-2"} ${sidebarPanel === key && (key === "dashboard" || modalOpen) ? "bg-[#effaf4] text-[#16845f]" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={18}/>{sidebarOpen && <span>{label}</span>}</button>)}</nav>
      </aside>

      <div className="fixed left-0 top-0 z-40 flex w-full items-center justify-between border-b border-[#dcebe4] bg-white px-4 py-3 lg:hidden"><div className="flex items-center gap-2"><Menu size={20} className="text-[#16845f]"/><span className="font-black text-[#12345b]">Cooperative Menu</span></div><select value={sidebarPanel} onChange={(e) => handleSidebarNavigation(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm font-bold">{sidebarItems.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></div>

      <header className="border-b border-[#dcebe4] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:pl-[var(--sidebar-space)]"><div className="flex items-center gap-3"><img src={logo} alt="Sahayog Logo" className="h-11 w-11 object-contain"/><div><p className="text-lg font-extrabold text-[#12345b]">Sahayog</p><p className="text-xs text-slate-500">Cooperative management</p></div></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-bold text-[#12345b]">{profile?.fullName || admin?.fullName || "Cooperative Admin"}</p><p className="text-xs text-slate-500">Cooperative Owner</p></div><ProfileAvatar src={profile?.profilePhoto || admin?.profilePhoto} name={profile?.fullName || admin?.fullName || "Cooperative Owner"} size="sm" /><button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#16845f] hover:text-[#16845f]"><LogOut size={16} /><span className="hidden sm:inline">Logout</span></button></div></div>
      </header>

      <div id="cooperative-dashboard" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10 lg:pl-[var(--sidebar-space)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-bold text-[#16845f]">Cooperative dashboard</p><h1 className="mt-1 text-3xl font-black text-[#12345b]">Cooperative Summary</h1><p className="mt-1 text-sm text-slate-500">{cooperative.name || "Your Cooperative"}</p></div>
          <button onClick={loadDashboard} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-[#12345b] shadow-sm hover:border-[#16845f] disabled:opacity-60"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> {loading ? "Refreshing..." : "Refresh"}</button>
        </div>
        {message && !modalOpen && <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700" role="status">{message}</div>}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{summaryCards.map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-[#e0ebe6] bg-white p-5 shadow-sm"><Icon className="text-[#16845f]" size={20}/><p className="mt-3 text-sm font-semibold text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-[#12345b]">{value ?? 0}</p></div>)}</section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-[#e0ebe6] bg-white p-5 shadow-sm sm:p-7"><p className="text-sm font-bold text-[#16845f]">Worker onboarding</p><h2 className="mt-1 text-2xl font-black text-[#12345b]">Pending join requests</h2><div className="mt-5 space-y-4">{requests.length ? requests.map((request) => { const worker = request.workerId || {}; return <article key={request._id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-black text-[#12345b]">{worker.fullName || "Worker"}</p><p className="mt-1 text-sm text-slate-500">{worker.email || ""} {worker.phone ? `• ${worker.phone}` : ""}</p><p className="mt-2 text-sm text-slate-600">{worker.skills?.map((skill) => skill.service).join(", ") || worker.service || "Skills not listed"}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">PENDING</span></div><div className="mt-4 flex gap-2"><button disabled={processingId === request._id} onClick={() => reviewRequest(request._id, "accept")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#16845f] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50"><CheckCircle2 size={16}/>Accept</button><button disabled={processingId === request._id} onClick={() => reviewRequest(request._id, "reject")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-bold text-red-600 disabled:opacity-50"><XCircle size={16}/>Reject</button></div></article>; }) : <div className="rounded-2xl bg-[#f7faf8] p-10 text-center"><Building2 className="mx-auto text-[#16845f]" size={28}/><p className="mt-3 font-extrabold text-[#12345b]">No pending requests</p><p className="mt-1 text-sm text-slate-500">New worker applications will appear here.</p></div>}</div></section>
          <section className="rounded-[2rem] border border-[#e0ebe6] bg-white p-5 shadow-sm sm:p-7"><p className="text-sm font-bold text-[#16845f]">Live overview</p><h2 className="mt-1 text-2xl font-black text-[#12345b]">Cooperative activity</h2><div className="mt-5 rounded-2xl bg-[#f7faf8] p-5"><p className="font-semibold text-slate-600">Live cooperative activity is connected to your current worker, request, and service statistics.</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[#16845f]"><span className="rounded-full bg-emerald-50 px-3 py-1">{stats.activeRequests ?? 0} active requests</span><span className="rounded-full bg-emerald-50 px-3 py-1">{stats.completedJobs ?? 0} completed services</span></div></div></section>
        </div>
      </div>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><div role="dialog" aria-modal="true" aria-labelledby="cooperative-modal-title" className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8" onMouseDown={(event) => event.stopPropagation()}><div id="cooperative-modal-title" className="sr-only">{sidebarItems.find(([key]) => key === sidebarPanel)?.[1] || "Cooperative"}</div>{renderModalContent()}</div></div>}
    </main>
  );

}

function ModalHeader({ icon: Icon, title, subtitle, onClose }) {
  return <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#effaf4] text-[#16845f]"><Icon size={20}/></div><div><p className="text-sm font-bold text-[#16845f]">{title}</p><h2 className="text-2xl font-black text-[#12345b]">{subtitle}</h2></div></div><button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-[#16845f] hover:text-[#16845f]">Close</button></div>;
}
function InlineMessage({ text }) { return <div className="mt-4 rounded-xl border border-slate-200 bg-[#f7faf8] p-3 text-sm font-semibold text-slate-700" role="status">{text}</div>; }

function WorkerCard({ worker, processingId, onStatus, onExperience }) {
  const suspended = worker.isSuspended || worker.status === "SUSPENDED";
  return <article className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef7f3] text-[#16845f]">{worker.profilePhoto ? <img src={worker.profilePhoto} alt={worker.fullName} className="h-full w-full object-cover"/> : <UserRound size={21}/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-black text-[#12345b]">{worker.fullName || "Worker"}</p><p className="mt-1 text-xs text-slate-500">{worker.phone} {worker.email ? `• ${worker.email}` : ""}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[worker.status] || statusStyles.OFFLINE}`}>{worker.status || "OFFLINE"}</span></div><p className="mt-2 text-sm text-slate-600">{worker.skills?.map((skill) => skill.service).join(", ") || worker.service || "Service not listed"}</p><div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-3"><span>Rating: {Number(worker.averageRating || 0).toFixed(1)} / 5</span><span>Completed: {worker.totalJobsCompleted || 0}</span><span>Experience: {worker.experienceYears || 0} yrs</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Experience category</span><select value={worker.experienceCategory || "PENDING"} onChange={(event) => onExperience(worker._id, event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#12345b] outline-none focus:border-[#16845f]"><option value="PENDING" disabled>Pending classification</option><option value="ANY">Any</option><option value="EXPERIENCED">Experienced</option></select></label><div><span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Administrative action</span><div className="mt-1">{suspended ? <button disabled={processingId === worker._id} onClick={() => onStatus(worker._id, "RESTORE")} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-700 disabled:opacity-50"><ShieldCheck size={16}/>{processingId === worker._id ? "Restoring..." : "Restore Worker"}</button> : <button disabled={processingId === worker._id} onClick={() => onStatus(worker._id, "SUSPENDED")} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-600 disabled:opacity-50"><ShieldAlert size={16}/>{processingId === worker._id ? "Suspending..." : "Suspend Worker"}</button>}</div></div></div></div></div></article>;
}

function PanelHeader({ icon: Icon, title, subtitle }) { return <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#effaf4] text-[#16845f]"><Icon size={19}/></div><div><p className="text-sm font-bold text-[#16845f]">{title}</p><h2 className="text-2xl font-black text-[#12345b]">{subtitle}</h2></div></div>; }
function ReportList({ title, rows = [], label }) { return <div className="rounded-2xl bg-[#f7faf8] p-5"><p className="font-black text-[#12345b]">{title}</p><div className="mt-4 space-y-3">{rows.length ? rows.map((row) => <div key={String(row._id)} className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-600">{label(row)}</span><span className="font-black text-[#12345b]">{row.count}</span></div>) : <p className="text-sm text-slate-500">No data available.</p>}</div></div>; }
function Field({ label, value, onChange, type="text" }) { return <label><span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span><input type={type} value={value ?? ""} onChange={(e)=>onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-[#16845f]"/></label>; }
function Toggle({ label, checked, onChange }) { return <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)} className="h-4 w-4 accent-[#16845f]"/>{label}</label>; }
function LoadingText({ text }) { return <div className="rounded-2xl bg-[#f7faf8] p-8 text-center text-sm font-semibold text-slate-500"><RefreshCw className="mx-auto mb-2 animate-spin text-[#16845f]" size={20}/>{text}</div>; }
function EmptyState({ icon: Icon, title, text }) { return <div className="rounded-2xl bg-[#f7faf8] p-10 text-center"><Icon className="mx-auto text-[#16845f]" size={28}/><p className="mt-3 font-extrabold text-[#12345b]">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
