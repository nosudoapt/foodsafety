"use client";

import { useState, useRef, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getSessionUser,
  getProfileContext,
  readLocal,
  writeLocal,
  fileToDataUrl,
} from "@/lib/admin-store";

interface StaffLicense {
  id: string;
  staffName: string;
  licenseType: string;
  fileName: string;
  fileSize: string;
  fileUrl?: string;
  issueDate: string;
  expiryDate: string;
  uploadedAt: string;
  notes: string;
}

const STORAGE_KEY = "btb-staff-licenses";

const licenseTypes = [
  { value: "food_handler", label: "Food Handler Certificate", icon: "🍽️" },
  { value: "first_aid", label: "First Aid Certificate", icon: "🩹" },
  { value: "whmis", label: "WHMIS Certification", icon: "⚠️" },
  { value: "other", label: "Other", icon: "📎" },
];

const DEMO_LICENSES: StaffLicense[] = [
  {
    id: "1",
    staffName: "Sarah Mitchell",
    licenseType: "food_handler",
    fileName: "Sarah_FoodHandler.pdf",
    fileSize: "420 KB",
    issueDate: "2025-06-15",
    expiryDate: "2028-06-15",
    uploadedAt: "2025-06-20",
    notes: "Level 2",
  },
  {
    id: "2",
    staffName: "James Rodriguez",
    licenseType: "first_aid",
    fileName: "James_FirstAid.pdf",
    fileSize: "380 KB",
    issueDate: "2025-09-01",
    expiryDate: "2027-09-01",
    uploadedAt: "2025-09-05",
    notes: "",
  },
  {
    id: "3",
    staffName: "Maria Chen",
    licenseType: "food_handler",
    fileName: "Maria_FoodHandler.pdf",
    fileSize: "415 KB",
    issueDate: "2024-03-10",
    expiryDate: "2027-03-10",
    uploadedAt: "2024-03-15",
    notes: "Level 1",
  },
];

function rowToLicense(row: Record<string, unknown>): StaffLicense {
  return {
    id: String(row.id),
    staffName: String(row.staff_name || ""),
    licenseType: String(row.license_type || "other"),
    fileName: String(row.file_name || ""),
    fileSize: String(row.file_size || ""),
    fileUrl: row.file_url ? String(row.file_url) : undefined,
    issueDate: String(row.issue_date || ""),
    expiryDate: String(row.expiry_date || ""),
    uploadedAt: String(row.created_at || "").slice(0, 10),
    notes: String(row.notes || ""),
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export default function StaffLicensesPage() {
  const [licenses, setLicenses] = useState<StaffLicense[]>(DEMO_LICENSES);

  const [showUpload, setShowUpload] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [licenseType, setLicenseType] = useState("food_handler");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        const user = await getSessionUser();
        if (cancelled) return;
        if (user) {
          const { data, error } = await supabase
            .from("staff_licenses")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          if (!cancelled && !error && data) {
            const mapped = data.map(rowToLicense);
            setLicenses(mapped);
            writeLocal(STORAGE_KEY, mapped);
            return;
          }
        }
        if (!cancelled) {
          const local = readLocal<StaffLicense[] | null>(STORAGE_KEY, null);
          if (local) setLicenses(local);
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !staffName) return;

    const fileUrl = await fileToDataUrl(selectedFile);
    const id = crypto.randomUUID();
    const newLicense: StaffLicense = {
      id,
      staffName,
      licenseType,
      fileName: selectedFile.name,
      fileSize: formatFileSize(selectedFile.size),
      fileUrl,
      issueDate,
      expiryDate,
      uploadedAt: new Date().toISOString().split("T")[0],
      notes: uploadNotes,
    };

    const next = [newLicense, ...licenses];
    setLicenses(next);
    writeLocal(STORAGE_KEY, next);
    setShowUpload(false);
    setStaffName("");
    setIssueDate("");
    setExpiryDate("");
    setUploadNotes("");
    setSelectedFile(null);

    const user = await getSessionUser();
    if (user) {
      const ctx = await getProfileContext();
      const { error } = await supabase.from("staff_licenses").insert({
        id,
        user_id: user.id,
        restaurant_name: ctx.restaurantName,
        staff_name: staffName,
        license_type: licenseType,
        file_name: newLicense.fileName,
        file_url: fileUrl,
        file_data: fileUrl,
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        notes: uploadNotes,
      });
      if (error) console.warn("staff_licenses insert failed:", error.message);
    }
  };

  const deleteLicense = (id: string) => {
    if (!confirm("Delete this license?")) return;
    const next = licenses.filter((l) => l.id !== id);
    setLicenses(next);
    writeLocal(STORAGE_KEY, next);
    void (async () => {
      const user = await getSessionUser();
      if (user) {
        await supabase.from("staff_licenses").delete().eq("id", id).eq("user_id", user.id);
      }
    })();
  };

  const getLicenseTypeInfo = (type: string) => {
    return licenseTypes.find((t) => t.value === type) || licenseTypes[3];
  };

  const isExpiringSoon = (expiryDate: string) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 90 && diffDays >= 0;
  };

  const isExpired = (expiryDate: string) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Licenses</h1>
          <p className="text-sm text-gray-500">
            Health & safety certificates for all staff members
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Add License
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Add Staff License</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Staff Name
                </label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g. Sarah Mitchell"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  License Type
                </label>
                <select
                  value={licenseType}
                  onChange={(e) => setLicenseType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                >
                  {licenseTypes.map((lt) => (
                    <option key={lt.value} value={lt.value}>
                      {lt.icon} {lt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificate File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-900"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowUpload(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || !staffName}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{licenses.length}</p>
          <p className="text-xs text-gray-500">Total Licenses</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">
            {licenses.filter((l) => isExpiringSoon(l.expiryDate)).length}
          </p>
          <p className="text-xs text-gray-500">Expiring Soon</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-600">
            {licenses.filter((l) => isExpired(l.expiryDate)).length}
          </p>
          <p className="text-xs text-gray-500">Expired</p>
        </div>
      </div>

      {/* License List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                  Staff Member
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                  License Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                  File
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                  Expiry
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {licenses.map((license) => {
                const typeInfo = getLicenseTypeInfo(license.licenseType);
                const expiring = isExpiringSoon(license.expiryDate);
                const expired = isExpired(license.expiryDate);

                return (
                  <tr key={license.id} className={`hover:bg-gray-50 ${expired ? "bg-red-50" : expiring ? "bg-amber-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-gray-600">
                            {license.staffName.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{license.staffName}</p>
                          {license.notes && (
                            <p className="text-[10px] text-gray-500">{license.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-gray-700">
                        {typeInfo.icon} {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-900 truncate max-w-[200px]">{license.fileName}</p>
                      <p className="text-[10px] text-gray-500">{license.fileSize}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-bold ${
                          expired ? "text-red-600" : expiring ? "text-amber-600" : "text-gray-900"
                        }`}
                      >
                        {license.expiryDate || "N/A"}
                        {expired && " (EXPIRED)"}
                        {expiring && " (Soon)"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {license.fileUrl && (
                          <a
                            href={license.fileUrl}
                            download={license.fileName}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            View
                          </a>
                        )}
                        <button
                          onClick={() => deleteLicense(license.id)}
                          aria-label={`Delete ${license.staffName} license`}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
