"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

const DISMISSED_KEY = "tutorial_banner_dismissed";
const DISMISS_EVENT = "tutorial-banner-dismissed";

function useDismissed() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    const handler = () => setDismissed(true);
    window.addEventListener(DISMISS_EVENT, handler);
    return () => window.removeEventListener(DISMISS_EVENT, handler);
  }, []);

  return dismissed;
}

function dismissBanner() {
  localStorage.setItem(DISMISSED_KEY, "1");
  window.dispatchEvent(new CustomEvent(DISMISS_EVENT));
}

export function TutorialBanner() {
  const dismissed = useDismissed();
  if (dismissed === null || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-[#7C563D] to-[#A05035] text-white rounded-xl px-4 py-3 mb-5">
      <div>
        <p className="font-bold text-sm">📹 Video Tutorials</p>
        <p className="text-xs text-white/80 mt-0.5">
          Learn how to use this app step by step
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/tutorial"
          className="bg-white text-[#7C563D] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#E9DFC6] transition-colors whitespace-nowrap"
        >
          View Tutorials →
        </Link>
        <button
          onClick={dismissBanner}
          aria-label="Dismiss tutorial banner"
          className="bg-white/20 hover:bg-white/30 rounded-lg p-1.5 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function TutorialButton() {
  const dismissed = useDismissed();
  if (!dismissed) return null;

  return (
    <Link
      href="/tutorial"
      className="flex items-center gap-1.5 bg-[#F5EFE0] border border-[#C4956A] text-[#7C563D] text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#EDE4CF] transition-colors whitespace-nowrap"
    >
      📹 Tutorial
    </Link>
  );
}
