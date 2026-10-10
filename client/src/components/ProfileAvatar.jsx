import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { API_BASE } from "../lib/api";

const sizeClasses = {
  sm: "h-10 w-10 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-20 w-20 text-xl",
  xl: "h-24 w-24 text-2xl",
};

const getInitials = (name = "") => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
};

const resolveImageUrl = (src) => {
  if (!src) return "";
  const value = String(src).trim();
  if (/^https?:\/\//i.test(value)) return value;

  try {
    if (value.startsWith("/")) {
      return new URL(value, API_BASE).toString();
    }
    return `${API_BASE.replace(/\/$/, "")}/${value.replace(/^\//, "")}`;
  } catch {
    return value;
  }
};

export default function ProfileAvatar({ src, name, size = "md", className = "" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const imageUrl = resolveImageUrl(src);
  const hasImage = Boolean(imageUrl) && !failed;
  const sizeClass = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border-2 border-[#16845f]/20 bg-[#effaf4] text-[#16845f] ring-4 ring-[#effaf4] ${sizeClass} ${className}`}
      aria-label={name ? `${name} profile photo` : "Profile avatar"}
    >
      {hasImage ? (
        <img
          src={imageUrl}
          alt={name ? `${name} profile` : "Profile"}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-black">
          {getInitials(name) || <UserRound className="h-1/2 w-1/2" strokeWidth={2} />}
        </div>
      )}
    </div>
  );
}
