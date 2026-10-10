import { useEffect, useState } from "react";
import { api } from "../lib/api";
import logo from "../assets/logo.png";
import { CheckCircle2, LogIn, LogOut, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

export default function SystemAdminPage({ mode = "login", onAuthenticated, onLogout }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cooperatives, setCooperatives] = useState([]);
  const [status, setStatus] = useState("PENDING");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const loadCooperatives = async () => {
    setLoading(true);
    try {
      const response = await api(`/system-admin/cooperatives?status=${status}`);
      setCooperatives(response.data?.cooperatives || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Unable to load cooperatives.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "dashboard") loadCooperatives();
  }, [mode, status]);

  const login = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await api("/system-admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onAuthenticated(response.data?.admin);
    } catch (error) {
      setMessage(error.message || "Invalid System Admin credentials.");
    } finally {
      setLoading(false);
    }
  };

  const approve = async (id) => {
    setProcessingId(id);
    try {
      await api(`/system-admin/cooperatives/${id}/approve`, { method: "PATCH" });
      setMessage("Cooperative approved successfully.");
      await loadCooperatives();
    } catch (error) {
      setMessage(error.message || "Unable to approve cooperative.");
    } finally {
      setProcessingId(null);
    }
  };

  const reject = async (cooperative) => {
    const reason = window.prompt("Enter rejection reason:", "Registration details could not be verified.");
    if (!reason?.trim()) return;
    setProcessingId(cooperative._id);
    try {
      await api(`/system-admin/cooperatives/${cooperative._id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      setMessage("Cooperative rejected.");
      await loadCooperatives();
    } catch (error) {
      setMessage(error.message || "Unable to reject cooperative.");
    } finally {
      setProcessingId(null);
    }
  };

  if (mode === "login") {
    return (
      <main className="min-h-screen bg-[#f8fbfd] px-4 py-10 text-[#12345b]">
        <div className="mx-auto max-w-md">
          <div className="mb-8 flex items-center justify-center gap-3">
            <img src={logo} alt="Sahayog Logo" className="h-12 w-12 object-contain" />
            <div><p className="text-xl font-extrabold">Sahayog</p><p className="text-xs text-slate-500">System Administration</p></div>
          </div>
          <form onSubmit={login} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
            <div className="flex items-center gap-3"><div className="rounded-2xl bg-[#12345b]/10 p-3"><ShieldCheck className="text-[#12345b]" /></div><div><p className="text-sm font-bold uppercase tracking-wider text-[#16845f]">Restricted access</p><h1 className="text-2xl font-black">System Admin Login</h1></div></div>
            <p className="mt-4 text-sm leading-6 text-slate-500">Use the credentials configured in the server <code>.env</code> file.</p>
            {message && <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{message}</div>}
            <div className="mt-6 space-y-4">
              <input className="auth-input" type="email" placeholder="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input className="auth-input" type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#12345b] px-5 py-4 font-bold text-white disabled:opacity-60"><LogIn size={18} /> {loading ? "Signing in..." : "Login as System Admin"}</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbfd] text-[#12345b]">
      <header className="sticky top-0 z-40 border-b border-[#dce8e3] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3"><img src={logo} alt="Sahayog Logo" className="h-11 w-11 object-contain" /><div><p className="text-lg font-extrabold">Sahayog</p><p className="text-xs text-slate-500">System Admin Dashboard</p></div></div>
          <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"><LogOut size={16} /> Logout</button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8">
        <section className="rounded-[2rem] bg-[#12345b] p-7 text-white shadow-xl"><p className="text-sm font-bold uppercase tracking-wider text-emerald-200">Verification control</p><h1 className="mt-2 text-3xl font-black">Cooperative Verification</h1><p className="mt-2 text-sm text-slate-200">Approve genuine cooperatives before they can log in or enter the worker network.</p></section>
        {message && <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold">{message}</div>}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {["PENDING", "ACTIVE", "INACTIVE"].map((value) => <button key={value} onClick={() => setStatus(value)} className={`rounded-xl px-4 py-2 text-sm font-bold ${status === value ? "bg-[#16845f] text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{value}</button>)}
          <button onClick={loadCooperatives} disabled={loading} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh</button>
        </div>
        <section className="mt-5 space-y-4">
          {cooperatives.length ? cooperatives.map((cooperative) => (
            <article key={cooperative._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{cooperative.name}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{cooperative.status}</span></div><p className="mt-2 text-sm text-slate-500">Registration: <strong>{cooperative.registrationNumber}</strong> • {cooperative.type}</p><p className="mt-1 text-sm text-slate-500">{cooperative.contact?.email} • {cooperative.contact?.phone}</p><p className="mt-1 text-sm text-slate-500">{cooperative.address?.area}, {cooperative.address?.city}, {cooperative.address?.state} - {cooperative.address?.pincode}</p></div>
                {status === "PENDING" && <div className="flex gap-2"><button disabled={processingId === cooperative._id} onClick={() => approve(cooperative._id)} className="inline-flex items-center gap-2 rounded-xl bg-[#16845f] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><CheckCircle2 size={17}/> Approve</button><button disabled={processingId === cooperative._id} onClick={() => reject(cooperative)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 disabled:opacity-50"><XCircle size={17}/> Reject</button></div>}
              </div>
            </article>
          )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><ShieldCheck className="mx-auto text-[#16845f]" size={32}/><p className="mt-3 font-black">No {status.toLowerCase()} cooperatives</p></div>}
        </section>
      </div>
    </main>
  );
}
