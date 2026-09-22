"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, Save, AlertCircle, HardDrive, CloudOff, Shield } from "lucide-react";
import { toast } from "sonner";
import { PaymentSettingsCard } from "@/components/dashboard/payment-settings";
import { PlanEditorCard } from "@/components/dashboard/plan-editor";

export default function SettingsPage() {
    const { data: authSession } = useSession();
    const isSuperAdmin = (authSession?.user as any)?.role === "SUPERADMIN";

    const [systemConfig, setSystemConfig] = useState({
        appName: "WA-AKG",
        description: "WhatsApp Gateway & Management Dashboard",
        logoUrl: "",
        timezone: "Asia/Jakarta",
        enableRegistration: true,
        allowLocalStorage: false,
        allowLocalStorageFor: [] as string[],
    });
    const [systemLoading, setSystemLoading] = useState(false);
    const [timezones, setTimezones] = useState<string[]>(["UTC", "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]);
    const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string }[]>([]);
    const [perUserInput, setPerUserInput] = useState("");

    useEffect(() => {
        try {
            if (typeof Intl !== "undefined" && Intl.supportedValuesOf) {
                const list = Intl.supportedValuesOf("timeZone");
                if (!list.includes("UTC")) {
                    list.push("UTC");
                }
                list.sort();
                setTimezones(list);
            }
        } catch (e) {
            console.error("Failed to load timezones dynamically", e);
        }
    }, []);

    useEffect(() => {
        fetch('/api/settings/system')
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(responseData => {
                const data = responseData?.data;
                if (data && !responseData.error) {
                    setSystemConfig({
                        appName: data.appName || "WA-AKG",
                        description: data.description || "WhatsApp Gateway & Management Dashboard",
                        logoUrl: data.logoUrl || "",
                        // @ts-ignore
                        faviconUrl: data.faviconUrl || "/favicon.svg",
                        timezone: data.timezone || "Asia/Jakarta",
                        enableRegistration: data.enableRegistration !== undefined ? data.enableRegistration : true,
                        allowLocalStorage: data.allowLocalStorage || false,
                        allowLocalStorageFor: Array.isArray(data.allowLocalStorageFor) ? data.allowLocalStorageFor : [],
                    } as any);
                }
            })
            .catch(() => { });
    }, []);

    // Fetch users for per-user override (SuperAdmin only)
    useEffect(() => {
        if (!isSuperAdmin) return;
        fetch("/api/users")
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d?.data) {
                    setAllUsers(d.data.map((u: any) => ({ id: u.id, name: u.name || "", email: u.email })));
                }
            })
            .catch(() => {});
    }, [isSuperAdmin]);

    const handleSaveSystem = async () => {
        setSystemLoading(true);
        try {
            const res = await fetch('/api/settings/system', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(systemConfig)
            });

            if (res.ok) {
                toast.success("System settings updated. Refresh to see changes.");
            } else {
                toast.error("Failed to update system settings");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error saving system settings");
        } finally {
            setSystemLoading(false);
        }
    };

    const addPerUserOverride = () => {
        const trimmed = perUserInput.trim();
        if (!trimmed) return;

        // Find user by email or ID
        const matchedUser = allUsers.find(u => u.email === trimmed || u.id === trimmed);
        const userId = matchedUser ? matchedUser.id : trimmed;

        if (!systemConfig.allowLocalStorageFor.includes(userId)) {
            setSystemConfig(prev => ({
                ...prev,
                allowLocalStorageFor: [...prev.allowLocalStorageFor, userId]
            }));
        }
        setPerUserInput("");
    };

    const removePerUserOverride = (userId: string) => {
        setSystemConfig(prev => ({
            ...prev,
            allowLocalStorageFor: prev.allowLocalStorageFor.filter(id => id !== userId),
        }));
    };

    const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl sm:text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground text-sm mt-1">Global system configuration. Only SuperAdmins can make changes.</p>
            </div>

            {!isSuperAdmin && (
                <Card className="border-yellow-200 bg-yellow-50">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-yellow-900">View Only Mode</p>
                                <p className="text-xs text-yellow-700 mt-1">
                                    Only Superadmins can modify system settings. You can view current settings but cannot make changes.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* System Configuration (Global) */}
            <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                    <CardTitle className="text-xl">App Configuration</CardTitle>
                    <CardDescription>Global settings for the application branding and access control.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Application Name</Label>
                            <input
                                className={inputClass}
                                placeholder="WA-AKG"
                                value={systemConfig.appName}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, appName: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">Changes the name in the sidebar and browser title.</p>
                        </div>

                        <div className="grid gap-2">
                            <Label>Timezone</Label>
                            <select
                                className={inputClass}
                                value={systemConfig.timezone}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, timezone: e.target.value }))}
                                disabled={!isSuperAdmin}
                            >
                                {timezones.map((tz) => (
                                    <option key={tz} value={tz}>
                                        {tz}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">Scheduler will use this timezone.</p>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>Browser Tab Description</Label>
                        <textarea
                            className={`${inputClass} min-h-[90px]`}
                            placeholder="WhatsApp Gateway & Management Dashboard"
                            value={systemConfig.description}
                            onChange={(e) => setSystemConfig(prev => ({ ...prev, description: e.target.value }))}
                            disabled={!isSuperAdmin}
                        />
                        <p className="text-xs text-muted-foreground">This text is used for the browser tab description and social preview metadata.</p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Logo URL</Label>
                            <input
                                className={inputClass}
                                placeholder="https://example.com/logo.png"
                                value={systemConfig.logoUrl}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">URL for the main dashboard logo.</p>
                        </div>
                        <div className="grid gap-2">
                            <Label>Favicon URL</Label>
                            <input
                                className={inputClass}
                                placeholder="/favicon.svg"
                                value={(systemConfig as any).faviconUrl || ""}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, faviconUrl: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">URL for the browser tab icon.</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50">
                        <Label htmlFor="enable-registration" className="flex flex-col space-y-1 min-w-0 flex-1">
                            <span>Enable User Registration</span>
                            <span className="font-normal text-xs text-muted-foreground">Allow new users to sign up for accounts. Turn off to keep the platform private.</span>
                        </Label>
                        <Switch
                            id="enable-registration"
                            checked={systemConfig.enableRegistration}
                            onCheckedChange={c => setSystemConfig(prev => ({ ...prev, enableRegistration: c }))}
                            disabled={!isSuperAdmin}
                        />
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSaveSystem} disabled={systemLoading || !isSuperAdmin}>
                            {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Configuration
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Media Storage Policy — SUPERADMIN only */}
            {isSuperAdmin && (
                <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Shield className="h-5 w-5 text-orange-600" />
                            Media Storage Policy
                        </CardTitle>
                        <CardDescription>
                            Control whether users can use local disk storage for WhatsApp media.
                            By default, local storage is <strong>disabled</strong> — users must configure their own cloud storage.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="allow-local-storage" className="flex flex-col space-y-1 min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                    <HardDrive className="h-4 w-4" />
                                    Allow Local Disk Storage
                                </span>
                                <span className="font-normal text-xs text-muted-foreground">
                                    When enabled, users without cloud storage will save media to the server&apos;s local disk.
                                    When disabled, only users with configured cloud storage can save media files.
                                </span>
                            </Label>
                            <Switch
                                id="allow-local-storage"
                                checked={systemConfig.allowLocalStorage}
                                onCheckedChange={c => setSystemConfig(prev => ({ ...prev, allowLocalStorage: c }))}
                            />
                        </div>

                        {/* Per-user overrides */}
                        <div className="border-t border-border/50 pt-4">
                            <Label className="flex flex-col space-y-1 mb-3">
                                <span className="text-sm font-medium">Per-User Local Storage Override</span>
                                <span className="font-normal text-xs text-muted-foreground">
                                    Grant specific users local storage access regardless of the global setting.
                                </span>
                            </Label>

                            <div className="flex gap-2 mb-3">
                                <input
                                    className={inputClass}
                                    placeholder="Enter user email or ID"
                                    value={perUserInput}
                                    onChange={(e) => setPerUserInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && addPerUserOverride()}
                                    list="user-suggestions"
                                />
                                <datalist id="user-suggestions">
                                    {allUsers.map(u => (
                                        <option key={u.id} value={u.email}>{u.name || u.email}</option>
                                    ))}
                                </datalist>
                                <Button variant="outline" onClick={addPerUserOverride}>Add</Button>
                            </div>

                            {systemConfig.allowLocalStorageFor.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {systemConfig.allowLocalStorageFor.map((userId) => {
                                        const user = allUsers.find(u => u.id === userId);
                                        return (
                                            <span
                                                key={userId}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 text-xs font-medium"
                                            >
                                                {user ? (user.name || user.email) : userId}
                                                <button
                                                    onClick={() => removePerUserOverride(userId)}
                                                    className="hover:text-destructive transition-colors"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <CloudOff className="h-3.5 w-3.5" />
                                    No per-user overrides set.
                                </p>
                            )}
                        </div>

                        <div className="pt-2">
                            <Button onClick={handleSaveSystem} disabled={systemLoading}>
                                {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Save Storage Policy
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Payment Gateway — SUPERADMIN only */}
            {isSuperAdmin && <PaymentSettingsCard />}

            {/* Plan & Pricing editor — SUPERADMIN only */}
            {isSuperAdmin && <PlanEditorCard />}

            {/* System Updates */}
            <Card>
                <CardHeader>
                    <CardTitle>System Updates</CardTitle>
                    <CardDescription>Check for the latest version from GitHub.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={async () => {
                            setSystemLoading(true);
                            try {
                                const res = await fetch("/api/system/check-updates", { method: "POST" });
                                const data = await res.json();
                                if (data.status) {
                                    toast.success(data.message || "Check complete!");
                                } else {
                                    toast.error(data.message || "Failed to check updates");
                                }
                            } catch (e) {
                                toast.error("Error checking updates");
                            } finally {
                                setSystemLoading(false);
                            }
                        }}
                        disabled={systemLoading}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${systemLoading ? 'animate-spin' : ''}`} />
                        Check for Updates
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

