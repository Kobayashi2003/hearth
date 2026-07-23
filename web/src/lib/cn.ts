import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge class names, letting a later utility win over an earlier conflicting one. */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
