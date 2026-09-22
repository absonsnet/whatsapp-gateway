"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Github, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingNav({ initialAppName = "WA-AKG" }: { initialAppName?: string }) {
    const [open, setOpen] = useState(false);
    // null = unknown, true/false = login status. Use the next-auth endpoint
    // (/api/auth/session) so the public page does not need SessionProvider.
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [appName, setAppName] = useState(initialAppName);

    useEffect(() => {
        let active = true;

        fetch("/api/auth/session", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (active) setAuthed(!!d?.user);
            })
            .catch(() => {
                if (active) setAuthed(false);
            });

        fetch("/api/settings/system", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!active) return;
                const nextName = d?.data?.appName || initialAppName;
                if (nextName) setAppName(nextName);
            })
            .catch(() => {
                if (active) setAppName(initialAppName);
            });

        return () => {
            active = false;
        };
    }, [initialAppName]);

    const ctaHref = authed ? "/dashboard" : "/auth/login";
    const ctaLabel = authed ? "Dashboard" : "Sign In";

    const close = () => setOpen(false);

    return (
        <>
            <header className="fixed top-4 inset-x-4 md:inset-x-auto md:top-6 md:left-1/2 md:-translate-x-1/2 z-50 md:w-full md:max-w-5xl transition-all duration-300">
                <div className="glass rounded-full px-4 md:px-8 h-14 md:h-16 flex items-center justify-between mx-auto shadow-lg shadow-black/5 dark:shadow-black/20 border border-white/40 dark:border-white/10">
                    <Link href="/" className="flex items-center gap-3 font-bold text-xl shrink-0">
                        <div className="relative h-8 w-8 md:h-10 md:w-10 overflow-hidden rounded-full border border-white/20 bg-white/10 shadow-lg shadow-primary/10">
                            <Image src="/logo.svg" alt={`${appName} logo`} width={40} height={40} className="h-full w-full object-cover" />
                        </div>
                        <span className="text-foreground tracking-tight" translate="no">{appName}</span>
                    </Link>

                    {/* Desktop nav */}
                    <nav className="hidden md:flex items-center gap-6 lg:gap-8">
                        <Link href="/#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</Link>
                        <Link href="/#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
                        <Link href="/docs" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">API & Docs</Link>
                        <Link href="https://github.com/vinsaeroy/WA-AKG" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                            <Github className="h-4 w-4" /> GitHub
                        </Link>
                    </nav>

                    {/* Right side: hamburger (mobile) + sign in */}
                    <div className="flex items-center gap-2 shrink-0">
                        <Link href={ctaHref} className="hidden sm:block">
                            <Button size="sm" className="rounded-full px-5 md:px-6 bg-foreground text-background hover:bg-foreground/90 shadow-xl shadow-foreground/10">
                                {ctaLabel}
                            </Button>
                        </Link>
                        <button
                            type="button"
                            aria-label="Toggle menu"
                            aria-expanded={open}
                            onClick={() => setOpen((v) => !v)}
                            className="md:hidden p-2 rounded-full hover:bg-foreground/5 transition-colors"
                        >
                            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </button>
                    </div>
                </div>

                {/* Mobile dropdown panel */}
                {open && (
                    <div className="md:hidden mt-2 mx-auto glass rounded-2xl border border-white/40 dark:border-white/10 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <nav className="flex flex-col p-2">
                            <Link
                                href="/#features"
                                onClick={close}
                                className="px-4 py-3 text-sm font-medium text-foreground/80 hover:bg-foreground/5 rounded-xl transition-colors"
                            >
                                Features
                            </Link>
                            <Link
                                href="/#pricing"
                                onClick={close}
                                className="px-4 py-3 text-sm font-medium text-foreground/80 hover:bg-foreground/5 rounded-xl transition-colors"
                            >
                                Pricing
                            </Link>
                            <Link
                                href="/docs"
                                onClick={close}
                                className="px-4 py-3 text-sm font-medium text-foreground/80 hover:bg-foreground/5 rounded-xl transition-colors"
                            >
                                API & Docs
                            </Link>
                            <Link
                                href="https://github.com/vinsaeroy/WA-AKG"
                                target="_blank"
                                rel="noreferrer"
                                onClick={close}
                                className="px-4 py-3 text-sm font-medium text-foreground/80 hover:bg-foreground/5 rounded-xl transition-colors flex items-center gap-2"
                            >
                                <Github className="h-4 w-4" /> GitHub
                            </Link>
                            <Link
                                href={ctaHref}
                                onClick={close}
                                className="mt-1 sm:hidden"
                            >
                                <Button size="sm" className="w-full rounded-xl bg-foreground text-background hover:bg-foreground/90">
                                    {ctaLabel}
                                </Button>
                            </Link>
                        </nav>
                    </div>
                )}
            </header>
        </>
    );
}
