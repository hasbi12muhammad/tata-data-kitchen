"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

const TUTORIALS = [
  {
    step: "STEP 1",
    title: "Login & Change Password Guide",
    src: "/videos/panduan-login.mp4",
  },
  {
    step: "STEP 2",
    title: "Managing Raw Materials & Calculating Product Cost",
    src: "/videos/panduan-bahan-baku-hpp.mp4",
  },
  {
    step: "STEP 3",
    title: "Adding Raw Material Purchases",
    src: "/videos/panduan-pembelian.mp4",
  },
];

export default function TutorialPage() {
  const router = useRouter();

  return (
    <AppLayout title="Tutorial">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-[#7C563D] font-medium hover:text-[#5C3D24] mb-5 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>
      <div className="space-y-6">
        {TUTORIALS.map(({ step, title, src }) => (
          <Card key={step}>
            <CardHeader>
              <p className="text-xs font-bold text-[#7C563D] uppercase tracking-wide mb-1">
                {step}
              </p>
              <h3 className="text-sm font-semibold text-[#2C1810]">{title}</h3>
            </CardHeader>
            <CardBody>
              <video src={src} controls preload="metadata" className="w-full rounded-lg">
                Sorry, this video could not be loaded.
              </video>
            </CardBody>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
