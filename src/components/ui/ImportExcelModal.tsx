"use client";

import * as XLSX from "xlsx";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";

interface ImportExcelModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  templateColumns: string[];
  templateRows: (string | number)[][];
  templateFilename: string;
  previewColumns: { key: string; label: string }[];
  onImport: (rows: Record<string, unknown>[]) => Promise<void>;
  importing: boolean;
}

export function ImportExcelModal({
  open,
  onClose,
  title,
  templateColumns,
  templateRows,
  templateFilename,
  previewColumns,
  onImport,
  importing,
}: ImportExcelModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  function handleClose() {
    setRows([]);
    setFileName("");
    setError("");
    onClose();
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([templateColumns, ...templateRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, templateFilename);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    setRows([]);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: "",
        });
        if (data.length === 0) {
          setError("File is empty or format does not match.");
          return;
        }
        setRows(data);
      } catch {
        setError("Failed to read file. Make sure the format is .xlsx or .xls.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }

  async function handleImport() {
    await onImport(rows);
    handleClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} size="lg">
      <div className="flex flex-col gap-5">
        {/* Template download */}
        <div className="rounded-xl bg-[#F5EFE0] border border-[#D9CCAF] p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#2C1810]">
              Download Template
            </p>
            <p className="text-xs text-[#7C6352] mt-0.5">
              Fill in the template then upload it back
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={downloadTemplate}>
            <Download className="w-4 h-4" /> Template
          </Button>
        </div>

        {/* File upload */}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-[#D9CCAF] bg-[#FBF8F2] hover:border-[#A05035] hover:bg-[#F5EFE0] transition-colors py-8 flex flex-col items-center gap-2 cursor-pointer"
          >
            <Upload className="w-6 h-6 text-[#B88D6A]" />
            <span className="text-sm text-[#7C6352]">
              {fileName ? (
                <span className="font-medium text-[#2C1810]">{fileName}</span>
              ) : (
                "Click to select an Excel file (.xlsx / .xls)"
              )}
            </span>
          </button>
        </div>

        {error && <p className="text-sm text-[#C0392B]">{error}</p>}

        {/* Preview */}
        {rows.length > 0 && (
          <div>
            <p className="text-xs text-[#7C6352] mb-2">
              Preview — {rows.length} rows
            </p>
            <div className="overflow-x-auto rounded-xl border border-[#D9CCAF]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#F5EFE0] border-b border-[#D9CCAF]">
                    {previewColumns.map((col) => (
                      <th
                        key={col.key}
                        className="px-3 py-2 text-left font-medium text-[#7C6352] uppercase tracking-wide whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-[#EDE4CF] last:border-0"
                    >
                      {previewColumns.map((col) => (
                        <td
                          key={col.key}
                          className="px-3 py-2 text-[#4A3728] whitespace-nowrap"
                        >
                          {String(row[col.key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length > 5 && (
                    <tr>
                      <td
                        colSpan={previewColumns.length}
                        className="px-3 py-2 text-center text-[#B88D6A]"
                      >
                        +{rows.length - 5} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            loading={importing}
            disabled={rows.length === 0}
            className="flex-1"
          >
            Import {rows.length > 0 ? `(${rows.length} rows)` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
