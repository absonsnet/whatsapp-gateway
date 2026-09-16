"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    RefreshCw,
    Save,
    Trash2,
    CheckCircle2,
    XCircle,
    Cloud,
    CloudOff,
    HardDrive,
    ExternalLink,
    TestTube,
    Plus,
    AlertCircle
} from "lucide-react";
import { toast } from "sonner";

type ProviderType = "GOOGLE_DRIVE" | "AWS_S3" | "CLOUDINARY" | "WEBDAV";

interface StorageConfig {
    id: string;
    provider: ProviderType;
    name: string;
    isActive: boolean;
    credentials: any;
    createdAt: string;
    updatedAt: string;
}

const PROVIDER_INFO: Record<ProviderType, { label: string; icon: string; description: string }> = {
    GOOGLE_DRIVE: {
        label: "Google Drive",
        icon: "🗂️",
        description: "Store media in your Google Drive using OAuth 2.0",
    },
    AWS_S3: {
        label: "AWS S3",
        icon: "☁️",
        description: "Upload to Amazon S3 or any S3-compatible storage",
    },
    CLOUDINARY: {
        label: "Cloudinary",
        icon: "🌤️",
        description: "Auto-optimized media hosting with CDN",
    },
    WEBDAV: {
        label: "WebDAV",
        icon: "🌐",
        description: "Nextcloud, ownCloud, or any WebDAV server",
    },
};

export default function CloudStoragePage() {
    const searchParams = useSearchParams();
    const [configs, setConfigs] = useState<StorageConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<ProviderType>("AWS_S3");
    const [formData, setFormData] = useState<any>({});
    const [configName, setConfigName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);

    const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

    const fetchConfigs = useCallback(async () => {
        try {
            const res = await fetch("/api/cloud-storage");
            const data = await res.json();
            if (data.status) {
                setConfigs(data.data);
            }
        } catch {
            toast.error("Failed to load cloud storage configs");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConfigs();
    }, [fetchConfigs]);

    // Handle OAuth redirect messages
    useEffect(() => {
        const success = searchParams.get("success");
        const error = searchParams.get("error");
        if (success) {
            toast.success(success);
            fetchConfigs();
        }
        if (error) {
            toast.error(error);
        }
    }, [searchParams, fetchConfigs]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const body: any = {
                provider: selectedProvider,
                name: configName || `My ${PROVIDER_INFO[selectedProvider].label}`,
                credentials: formData,
            };

            if (editingId) {
                body.id = editingId;
            }

            const res = await fetch("/api/cloud-storage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (data.status) {
                toast.success(editingId ? "Configuration updated" : "Configuration saved");
                setShowForm(false);
                setEditingId(null);
                setFormData({});
                setConfigName("");
                fetchConfigs();
            } else {
                toast.error(data.message || "Failed to save");
            }
        } catch {
            toast.error("Error saving configuration");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this cloud storage configuration?")) return;
        try {
            const res = await fetch("/api/cloud-storage", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (data.status) {
                toast.success("Configuration deleted");
                fetchConfigs();
            } else {
                toast.error(data.message || "Failed to delete");
            }
        } catch {
            toast.error("Error deleting configuration");
        }
    };

    const handleToggle = async (id: string, isActive: boolean) => {
        try {
            const config = configs.find((c) => c.id === id);
            if (!config) return;

            const res = await fetch("/api/cloud-storage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    provider: config.provider,
                    credentials: config.credentials,
                    isActive,
                }),
            });

            const data = await res.json();
            if (data.status) {
                toast.success(isActive ? "Activated" : "Deactivated");
                fetchConfigs();
            }
        } catch {
            toast.error("Error toggling config");
        }
    };

    const handleTest = async (configId?: string) => {
        setTesting(configId || "new");
        try {
            const body: any = configId
                ? { configId }
                : { provider: selectedProvider, credentials: formData };

            const res = await fetch("/api/cloud-storage/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (data.data?.success) {
                toast.success("Connection successful! ✅");
            } else {
                toast.error(data.message || "Connection failed");
            }
        } catch {
            toast.error("Test failed");
        } finally {
            setTesting(null);
        }
    };

    const handleGoogleOAuth = () => {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId) {
            toast.error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID in .env");
            return;
        }

        const baseUrl = window.location.origin;
        const redirectUri = `${baseUrl}/api/cloud-storage/google/callback`;
        const scope = "https://www.googleapis.com/auth/drive.file";

        const state = btoa(JSON.stringify({ folderId: formData.folderId }));

        const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${clientId}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(scope)}` +
            `&access_type=offline` +
            `&prompt=consent` +
            `&state=${state}`;

        window.location.href = url;
    };

    const renderProviderForm = () => {
        switch (selectedProvider) {
            case "GOOGLE_DRIVE":
                return (
                    <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                Google Drive uses OAuth 2.0 for secure authentication. Click the button below to connect your account.
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label>Folder ID (optional)</Label>
                            <input
                                className={inputClass}
                                placeholder="e.g. 1a2b3c4d5e... (leave empty for root)"
                                value={formData.folderId || ""}
                                onChange={(e) => setFormData({ ...formData, folderId: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Find the folder ID in the Google Drive URL: drive.google.com/drive/folders/<strong>THIS_PART</strong>
                            </p>
                        </div>
                        <Button onClick={handleGoogleOAuth} className="w-full" variant="outline">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Connect with Google
                        </Button>
                    </div>
                );

            case "AWS_S3":
                return (
                    <div className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Access Key ID *</Label>
                                <input
                                    className={inputClass}
                                    placeholder="AKIAIOSFODNN7EXAMPLE"
                                    value={formData.accessKeyId || ""}
                                    onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Secret Access Key *</Label>
                                <input
                                    className={inputClass}
                                    type="password"
                                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                    value={formData.secretAccessKey || ""}
                                    onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Region *</Label>
                                <input
                                    className={inputClass}
                                    placeholder="us-east-1"
                                    value={formData.region || ""}
                                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Bucket Name *</Label>
                                <input
                                    className={inputClass}
                                    placeholder="my-whatsapp-media"
                                    value={formData.bucket || ""}
                                    onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Path Prefix</Label>
                                <input
                                    className={inputClass}
                                    placeholder="whatsapp-media/"
                                    value={formData.prefix || ""}
                                    onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Custom Endpoint</Label>
                                <input
                                    className={inputClass}
                                    placeholder="https://s3.example.com (for MinIO, etc.)"
                                    value={formData.endpoint || ""}
                                    onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                );

            case "CLOUDINARY":
                return (
                    <div className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Cloud Name *</Label>
                                <input
                                    className={inputClass}
                                    placeholder="my-cloud-name"
                                    value={formData.cloudName || ""}
                                    onChange={(e) => setFormData({ ...formData, cloudName: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>API Key *</Label>
                                <input
                                    className={inputClass}
                                    placeholder="123456789012345"
                                    value={formData.apiKey || ""}
                                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>API Secret *</Label>
                                <input
                                    className={inputClass}
                                    type="password"
                                    placeholder="Your Cloudinary API Secret"
                                    value={formData.apiSecret || ""}
                                    onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Folder</Label>
                                <input
                                    className={inputClass}
                                    placeholder="whatsapp-media"
                                    value={formData.folder || ""}
                                    onChange={(e) => setFormData({ ...formData, folder: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                );

            case "WEBDAV":
                return (
                    <div className="space-y-4">
                        <div className="grid gap-2">
                            <Label>WebDAV URL *</Label>
                            <input
                                className={inputClass}
                                placeholder="https://nextcloud.example.com/remote.php/dav/files/username"
                                value={formData.url || ""}
                                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                            />
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Username *</Label>
                                <input
                                    className={inputClass}
                                    placeholder="your-username"
                                    value={formData.username || ""}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Password *</Label>
                                <input
                                    className={inputClass}
                                    type="password"
                                    placeholder="your-password or app-password"
                                    value={formData.password || ""}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Base Path</Label>
                                <input
                                    className={inputClass}
                                    placeholder="/WhatsApp-Media/"
                                    value={formData.basePath || ""}
                                    onChange={(e) => setFormData({ ...formData, basePath: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Public URL Base</Label>
                                <input
                                    className={inputClass}
                                    placeholder="https://nextcloud.example.com/s/share"
                                    value={formData.publicUrlBase || ""}
                                    onChange={(e) => setFormData({ ...formData, publicUrlBase: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground">Public share URL prefix for serving files without auth.</p>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-xl sm:text-3xl font-bold tracking-tight">Cloud Storage</h2>
                    <p className="text-muted-foreground text-sm mt-1">Loading configurations...</p>
                </div>
                <div className="grid gap-4">
                    {[1, 2].map((i) => (
                        <Card key={i} className="animate-pulse">
                            <CardContent className="pt-6">
                                <div className="h-20 bg-muted rounded-lg" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Cloud className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                        Cloud Storage
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        Configure where your WhatsApp media files are stored.
                    </p>
                </div>
                {!showForm && (
                    <Button onClick={() => { setShowForm(true); setEditingId(null); setFormData({}); setConfigName(""); }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Provider
                    </Button>
                )}
            </div>

            {/* Info Banner */}
            {configs.length === 0 && !showForm && (
                <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">No cloud storage configured</p>
                                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                                    Media files from WhatsApp messages will not be saved until you configure a cloud storage provider.
                                    Click &quot;Add Provider&quot; to get started.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Add/Edit Form */}
            {showForm && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle>{editingId ? "Edit" : "Add"} Cloud Storage Provider</CardTitle>
                        <CardDescription>Configure credentials for your cloud storage provider.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Provider Tabs */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {(Object.keys(PROVIDER_INFO) as ProviderType[]).map((key) => (
                                <button
                                    key={key}
                                    onClick={() => { setSelectedProvider(key); setFormData({}); }}
                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-sm ${
                                        selectedProvider === key
                                            ? "border-primary bg-primary/10 text-primary font-medium"
                                            : "border-border hover:border-primary/30 text-muted-foreground"
                                    }`}
                                >
                                    <span className="text-xl">{PROVIDER_INFO[key].icon}</span>
                                    <span className="text-xs sm:text-sm">{PROVIDER_INFO[key].label}</span>
                                </button>
                            ))}
                        </div>

                        <p className="text-sm text-muted-foreground">{PROVIDER_INFO[selectedProvider].description}</p>

                        {/* Config Name */}
                        <div className="grid gap-2">
                            <Label>Configuration Name</Label>
                            <input
                                className={inputClass}
                                placeholder={`My ${PROVIDER_INFO[selectedProvider].label}`}
                                value={configName}
                                onChange={(e) => setConfigName(e.target.value)}
                            />
                        </div>

                        {/* Provider-specific form */}
                        {renderProviderForm()}

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t">
                            {selectedProvider !== "GOOGLE_DRIVE" && (
                                <>
                                    <Button onClick={handleSave} disabled={saving}>
                                        {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                        {editingId ? "Update" : "Save"} Configuration
                                    </Button>
                                    <Button variant="outline" onClick={() => handleTest()} disabled={testing === "new"}>
                                        {testing === "new" ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <TestTube className="h-4 w-4 mr-2" />}
                                        Test Connection
                                    </Button>
                                </>
                            )}
                            <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Existing Configs */}
            {configs.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Your Configurations</h3>
                    {configs.map((config) => {
                        const info = PROVIDER_INFO[config.provider];
                        return (
                            <Card key={config.id} className={config.isActive ? "border-green-200 dark:border-green-800" : "opacity-60"}>
                                <CardContent className="pt-6">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{info?.icon || "☁️"}</span>
                                            <div>
                                                <h4 className="font-medium flex items-center gap-2">
                                                    {config.name}
                                                    {config.isActive ? (
                                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                    ) : (
                                                        <XCircle className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </h4>
                                                <p className="text-xs text-muted-foreground">
                                                    {info?.label || config.provider} · Updated {new Date(config.updatedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={config.isActive}
                                                onCheckedChange={(checked) => handleToggle(config.id, checked)}
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleTest(config.id)}
                                                disabled={testing === config.id}
                                            >
                                                {testing === config.id ? (
                                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <TestTube className="h-3.5 w-3.5" />
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => handleDelete(config.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Info */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <HardDrive className="h-4 w-4" />
                        About Media Storage
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                        By default, local disk storage is <strong>disabled</strong> to conserve server space.
                        Configure a cloud provider above to save your WhatsApp media files.
                    </p>
                    <p>
                        If no cloud storage is configured, media messages will still be received but the media content
                        won&apos;t be saved — the message text and metadata are always preserved.
                    </p>
                    <p>
                        <CloudOff className="h-4 w-4 inline mr-1" />
                        Need local storage? Ask your administrator to enable it in <strong>Settings → Media Storage Policy</strong>.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
