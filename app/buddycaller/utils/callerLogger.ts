// Caller-side log helper (Web and Mobile)
// Purpose: Format console logs with caller name for readability
// Does NOT affect data fetching, cache, realtime, or any functionality

// Module-level mutable reference for caller name (updated from useAuthProfile)
// Uses an object wrapper to ensure the reference is always mutable and can be updated
// even after logs have already been created
const callerNameRef = { current: 'Caller' };

/**
 * Initialize or update the caller name for logging
 * Can be called multiple times safely - updates the name reference
 * Should be called when useAuthProfile loads, and can be called again when fullName becomes available
 * Works on both web and mobile
 * 
 * @param fullName - The caller's full name, or undefined/empty string to keep default
 */
export function initCallerLogger(fullName?: string | null) {
    // Update the mutable reference if a valid name is provided
    // If fullName is undefined, null, or empty, keep the current value (don't reset to 'Caller')
    if (fullName && fullName.trim()) {
        callerNameRef.current = fullName.trim();
    }
    // If fullName is not provided or empty, leave callerNameRef.current unchanged
    // This allows early logs to show 'Caller' and later logs to show the real name
    // once it becomes available
}

/**
 * Log helper for caller-side events
 * Formats logs with [CALLER][<Caller Name>] prefix
 * Always reads the latest caller name from the mutable reference
 * Works on both web and mobile
 */
export function logCaller(event: string, details?: string | object) {
    // Always read the current value from the mutable reference
    const prefix = `[CALLER][${callerNameRef.current}]`;
    const message = details 
        ? `${prefix} ${event}${typeof details === 'object' ? '\n' + JSON.stringify(details, null, 2) : ': ' + details}`
        : `${prefix} ${event}`;
    
    console.log(message);
}

/**
 * Log error helper for caller-side errors
 * Always reads the latest caller name from the mutable reference
 * Works on both web and mobile
 */
export function logCallerError(event: string, error: any) {
    // Always read the current value from the mutable reference
    const prefix = `[CALLER][${callerNameRef.current}]`;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${prefix} ${event}:`, errorMessage);
}

/**
 * Log warning helper for caller-side warnings
r * Always reads the latest caller name from the mutable reference
 * Works on both web and mobile
 */
export function logCallerWarn(event: string, details?: string) {
    // Always read the current value from the mutable reference
    const prefix = `[CALLER][${callerNameRef.current}]`;
    const message = details ? `${prefix} ${event}: ${details}` : `${prefix} ${event}`;
    console.warn(message);
}
