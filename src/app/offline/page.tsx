"use client";

export const dynamic = "force-dynamic";

export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-[#1E3A5F] flex items-center justify-center mx-auto mb-6">
          <div className="w-8 h-8 rounded bg-[#059669] flex items-center justify-center">
            <span className="text-white text-sm font-bold">C</span>
          </div>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">
          You&apos;re offline
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Check your internet connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center h-10 px-6 rounded-lg bg-[#1E3A5F] text-white text-sm font-medium cursor-pointer hover:bg-[#162d4a] transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
