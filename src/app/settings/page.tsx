"use client";

export const dynamic = "force-dynamic";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { HARDCODED_UNITS } from "@/components/ui/UnitSelect";
import { useCustomUnits, useCreateCustomUnit, useDeleteCustomUnit } from "@/hooks/useUnits";
import { usePackagingTypes, useCreatePackagingType, useDeletePackagingType } from "@/hooks/usePackagingTypes";
import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import toast from "react-hot-toast";

function EmailConfirmHandler() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    if (!tokenHash || type !== "email_change") return;

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: "email_change" })
      .then(({ error }) => {
        if (error) {
          toast.error("Confirmation failed: " + error.message);
        } else {
          toast.success("Email changed successfully!");
        }
        router.replace("/settings");
      });
  }, [searchParams, supabase.auth, router]);

  return null;
}

export default function SettingsPage() {
  const supabase = createClient();

  const [storeName, setStoreName] = useState("");
  const [storeNameLoading, setStoreNameLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.store_name) {
        setStoreName(user.user_metadata.store_name);
      }
    });
  }, []);

  async function handleStoreNameUpdate(e: React.FormEvent) {
    e.preventDefault();
    setStoreNameLoading(true);
    const { error } = await supabase.auth.updateUser({
      data: { store_name: storeName.trim() },
    });
    setStoreNameLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Store name saved successfully");
  }

  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const { data: customUnits = [] } = useCustomUnits();
  const createCustomUnit = useCreateCustomUnit();
  const deleteCustomUnit = useDeleteCustomUnit();

  const { data: packagingTypes = [] } = usePackagingTypes();
  const createPkgType = useCreatePackagingType();
  const deletePkgType = useDeletePackagingType();

  const [newUnitName, setNewUnitName] = useState("");
  const [addingUnit, setAddingUnit] = useState(false);

  const [newPkgName, setNewPkgName] = useState("");
  const [addingPkg, setAddingPkg] = useState(false);

  async function handleEmailUpdate(e: React.FormEvent) {
    e.preventDefault();
    setEmailLoading(true);
    setEmailSent(false);
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/settings` },
    );
    setEmailLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setEmailSent(true);
      setEmail("");
    }
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    setPasswordError("");
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password changed successfully");
      setPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <AppLayout title="Account Settings">
      <Suspense>
        <EmailConfirmHandler />
      </Suspense>
      <div className="max-w-lg mx-auto flex flex-col gap-6">
        {/* Store Name Section */}
        <div className="bg-[#FBF8F2] rounded-2xl border border-[#D9CCAF] shadow-sm p-6">
          <h2 className="text-base font-semibold text-[#2C1810] mb-1">
            Store Name
          </h2>
          <p className="text-sm text-[#7C6352] mb-5">
            Displayed in the sidebar to identify your store.
          </p>
          <form onSubmit={handleStoreNameUpdate} className="flex flex-col gap-4">
            <Input
              label="Store name"
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="e.g. The Kitchen Lab"
            />
            <Button type="submit" loading={storeNameLoading} className="self-start">
              Save
            </Button>
          </form>
        </div>

        {/* Email Section */}
        <div className="bg-[#FBF8F2] rounded-2xl border border-[#D9CCAF] shadow-sm p-6">
          <h2 className="text-base font-semibold text-[#2C1810] mb-1">
            Change Email
          </h2>
          <p className="text-sm text-[#7C6352] mb-5">
            A confirmation link will be sent to the new email.
          </p>
          {emailSent && (
            <div className="mb-4 rounded-lg bg-[#E9F5E9] border border-[#A8D5A2] px-4 py-3 text-sm text-[#2E6B2E]">
              Check your new email inbox for confirmation.
            </div>
          )}
          <form onSubmit={handleEmailUpdate} className="flex flex-col gap-4">
            <Input
              label="New email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="new@email.com"
            />
            <Button type="submit" loading={emailLoading} className="self-start">
              Save
            </Button>
          </form>
        </div>

        {/* Password Section */}
        <div className="bg-[#FBF8F2] rounded-2xl border border-[#D9CCAF] shadow-sm p-6">
          <h2 className="text-base font-semibold text-[#2C1810] mb-1">
            Change Password
          </h2>
          <p className="text-sm text-[#7C6352] mb-5">
            Use a strong password that has not been used before.
          </p>
          <form onSubmit={handlePasswordUpdate} className="flex flex-col gap-4">
            <Input
              label="New password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError("");
              }}
              required
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordError("");
              }}
              required
              placeholder="••••••••"
              autoComplete="new-password"
              error={passwordError}
            />
            <Button
              type="submit"
              loading={passwordLoading}
              className="self-start"
            >
              Save
            </Button>
          </form>
        </div>

        {/* Satuan Bahan Baku */}
        <div className="bg-[#FBF8F2] rounded-2xl border border-[#D9CCAF] shadow-sm p-6">
          <h2 className="text-base font-semibold text-[#2C1810] mb-1">Raw Material Units</h2>
          <p className="text-sm text-[#7C6352] mb-4">
            Units available for raw materials and recipes.
          </p>

          <div className="mb-3">
            <p className="text-xs font-medium text-[#7C6352] mb-2">Built-in units</p>
            <div className="flex flex-wrap gap-2">
              {HARDCODED_UNITS.map((u) => (
                <span key={u} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#EDE4CF] text-[#5C4535]">
                  {u}
                </span>
              ))}
            </div>
          </div>

          {customUnits.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-[#7C6352] mb-2">Custom units</p>
              <div className="flex flex-wrap gap-2">
                {customUnits.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-[#D9CCAF]/60 text-[#2C1810]">
                    {u.name}
                    <button
                      type="button"
                      onClick={() => deleteCustomUnit.mutate({ id: u.id, name: u.name })}
                      disabled={deleteCustomUnit.isPending}
                      className="ml-0.5 text-[#7C6352] hover:text-[#A05035] disabled:opacity-50 transition-colors"
                      aria-label={`Delete unit ${u.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {addingUnit ? (
            <div className="flex gap-2 mt-2">
              <input
                autoFocus
                className="h-9 rounded-lg border border-[#D9CCAF] bg-white px-3 text-sm text-[#2C1810] flex-1 focus:outline-none focus:ring-2 focus:ring-[#A05035]"
                placeholder="New unit name..."
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!newUnitName.trim() || createCustomUnit.isPending) return;
                    await createCustomUnit.mutateAsync(newUnitName.trim());
                    setNewUnitName("");
                    setAddingUnit(false);
                  }
                  if (e.key === "Escape") { setAddingUnit(false); setNewUnitName(""); }
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newUnitName.trim()) return;
                  await createCustomUnit.mutateAsync(newUnitName.trim());
                  setNewUnitName("");
                  setAddingUnit(false);
                }}
                disabled={!newUnitName.trim() || createCustomUnit.isPending}
                className="px-3 h-9 rounded-lg bg-[#A05035] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#8B4530] transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setAddingUnit(false); setNewUnitName(""); }}
                className="px-3 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352] hover:bg-[#EDE4CF] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingUnit(true)}
              className="mt-2 text-sm text-[#A05035] font-medium hover:underline"
            >
              + Add Unit
            </button>
          )}
        </div>

        {/* Jenis Kemasan */}
        <div className="bg-[#FBF8F2] rounded-2xl border border-[#D9CCAF] shadow-sm p-6">
          <h2 className="text-base font-semibold text-[#2C1810] mb-1">Packaging Types</h2>
          <p className="text-sm text-[#7C6352] mb-4">
            Packaging names used when recording purchases (bag, jug, sack, etc).
          </p>

          {packagingTypes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {packagingTypes.map((pt) => (
                <span key={pt.id} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-[#D9CCAF]/60 text-[#2C1810]">
                  {pt.name}
                  <button
                    type="button"
                    onClick={() => deletePkgType.mutate(pt.id)}
                    disabled={deletePkgType.isPending}
                    className="ml-0.5 text-[#7C6352] hover:text-[#A05035] disabled:opacity-50 transition-colors"
                    aria-label={`Delete packaging ${pt.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {addingPkg ? (
            <div className="flex gap-2 mt-2">
              <input
                autoFocus
                className="h-9 rounded-lg border border-[#D9CCAF] bg-white px-3 text-sm text-[#2C1810] flex-1 focus:outline-none focus:ring-2 focus:ring-[#A05035]"
                placeholder="New packaging name..."
                value={newPkgName}
                onChange={(e) => setNewPkgName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!newPkgName.trim() || createPkgType.isPending) return;
                    await createPkgType.mutateAsync(newPkgName.trim());
                    setNewPkgName("");
                    setAddingPkg(false);
                  }
                  if (e.key === "Escape") { setAddingPkg(false); setNewPkgName(""); }
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newPkgName.trim()) return;
                  await createPkgType.mutateAsync(newPkgName.trim());
                  setNewPkgName("");
                  setAddingPkg(false);
                }}
                disabled={!newPkgName.trim() || createPkgType.isPending}
                className="px-3 h-9 rounded-lg bg-[#A05035] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#8B4530] transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setAddingPkg(false); setNewPkgName(""); }}
                className="px-3 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352] hover:bg-[#EDE4CF] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingPkg(true)}
              className="text-sm text-[#A05035] font-medium hover:underline"
            >
              + Add Packaging
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
