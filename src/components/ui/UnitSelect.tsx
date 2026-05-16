"use client";

import { useCreateCustomUnit, useCustomUnits } from "@/hooks/useUnits";
import { useState } from "react";

export const HARDCODED_UNITS = ["gr", "ml", "pcs", "kg", "liter"];

const cls =
  "h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] placeholder:text-[#B88D6A] focus:outline-none focus:ring-2 focus:ring-[#A05035] focus:border-transparent";

interface UnitSelectProps {
  value: string;
  onChange: (unit: string) => void;
  required?: boolean;
  label?: string;
}

export function UnitSelect({ value, onChange, required, label = "Unit" }: UnitSelectProps) {
  const { data: customUnits = [] } = useCustomUnits();
  const createUnit = useCreateCustomUnit();
  const [adding, setAdding] = useState(false);
  const [newUnit, setNewUnit] = useState("");

  async function handleAdd() {
    const trimmed = newUnit.trim().toLowerCase();
    if (!trimmed) return;
    await createUnit.mutateAsync(trimmed);
    onChange(trimmed);
    setNewUnit("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="block text-sm font-medium text-[#4A3728]">{label}</label>
      )}
      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className={`${cls} flex-1`}
            placeholder="Nama satuan baru..."
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
              if (e.key === "Escape") { setAdding(false); setNewUnit(""); }
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newUnit.trim() || createUnit.isPending}
            className="px-3 h-9 rounded-lg bg-[#A05035] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#8B4530] transition-colors"
          >
            Tambah
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewUnit(""); }}
            className="px-3 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352] hover:bg-[#EDE4CF] transition-colors"
          >
            Batal
          </button>
        </div>
      ) : (
        <select
          className={`${cls} w-full`}
          value={value}
          onChange={(e) => {
            if (e.target.value === "__add__") { setAdding(true); return; }
            onChange(e.target.value);
          }}
          required={required}
        >
          {HARDCODED_UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
          {customUnits.length > 0 && (
            <>
              <option disabled>──────────</option>
              {customUnits.map((u) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </>
          )}
          <option value="__add__">+ Tambah satuan baru...</option>
        </select>
      )}
    </div>
  );
}
