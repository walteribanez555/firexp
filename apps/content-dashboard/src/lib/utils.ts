import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Human-readable byte size, e.g. 12.4 MB. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/** Last path segment of a URL/key, decoded — for showing an uploaded file's name. */
export function basename(url: string): string {
  try {
    const clean = url.split('?')[0];
    return decodeURIComponent(clean.substring(clean.lastIndexOf('/') + 1)) || clean;
  } catch {
    return url;
  }
}
