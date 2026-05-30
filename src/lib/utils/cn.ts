import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Standard className merger. Use everywhere a component needs to compose
 * its own classes with caller-provided ones. tailwind-merge resolves
 * conflicts (later utility wins), which keeps semantic classes from
 * being silently shadowed.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
