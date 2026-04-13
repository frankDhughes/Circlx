export function formatTime(dateString: string) {
  return new Date(dateString).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function getUsernameFromRelation(
  relation: { username: string } | { username: string }[] | null
) {
  if (!relation) return "Unknown";
  if (Array.isArray(relation)) return relation[0]?.username ?? "Unknown";
  return relation.username ?? "Unknown";
}

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}