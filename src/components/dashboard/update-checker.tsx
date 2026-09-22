"use client";

// ============================================================
// AUTO UPDATE CHECK DISABLED (manual updates only)
// ------------------------------------------------------------
// This component previously polled /api/system/check-updates automatically
// for releases from another repository (vinsaeroy/WA-AKG).
// Automatic checking is disabled so changes from that repository do not enter this one.
// Updates are performed manually.
// ============================================================

export function UpdateChecker() {
    // Intentionally do nothing: there is no polling of the upstream repository.
    return null;
}
