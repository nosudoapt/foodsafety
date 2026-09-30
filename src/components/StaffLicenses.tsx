"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getProfileContext } from "@/lib/profile";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";

interface StaffLicense {
  id: string;
  staffName: string;
  licenseType: string;
  fileName: string;
  fileSize: string;
  issueDate: string;
  expiryDate: string;
  uploadedAt: string;
  notes: string;
}

const licenseTypes = [
  { value: "food_handler", label: "Food Handler Certificate", icon: "🍽️" },
  { value: "first_aid", label: "First Aid Certificate", icon: "🩹" },
  { value: "whmis", label: "WHMIS Certification", icon: "⚠️" },
  { value: "other", label: "Other", icon: "📎" },
];

type LicenseRow = {
  id: string;
  staff_name: string;
  license_type: string;
  file_name: string;
  file_size: number | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
};

function toLicense(row: LicenseRow): StaffLicense {
  return {
    id: row.id,
    staffName: row.staff_name,
    licenseType: row.license_type,
    fileName: row.file_name,
    fileSize: formatFileSize(row.file_size),
    issueDate: row.issue_date || "",
    expiryDate: row.expiry_date || "",
    uploadedAt: (row.created_at || "").split("T")[0],
    notes: row.notes || "",
  };
}

const LICENSE_COLUMNS =
  "id, staff_name, license_type, file_name, file_size, issue_date, expiry_date, notes, created_at";

export default function StaffLicenses({ readOnly = false }: { readOnly?: boolean }) {
  const [licenses, setLicenses] = useState<StaffLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    const load = async () => {
      const { data, error } = await supabase
        .from("staff_licenses")
        .select(LICENSE_COLUMNS)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) setError(error.message);
      else setLicenses((data ?? []).map(toLicense));
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !staffName || saving) return;
    setSaving(true);
    setError("");

    const ctx = await getProfileContext();
    if (!ctx) {
      setError("No profile found for this session — sign in again.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("staff_licenses")
      .insert({
        user_id: ctx.userId,
        restaurant_name: ctx.restaurantName,
        staff_name: staffName,
        license_type: licenseType,
        file_name: selectedFile.name,
        file_url: await fileToDataUrl(selectedFile),
        file_size: selectedFile.size,
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        notes: uploadNotes,
      })
      .select(LICENSE_COLUMNS)
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setLicenses((prev) => [toLicense(data), ...prev]);
    setSaving(false);
    setShowUpload(false);
    setStaffName("");
    setIssueDate("");
    setExpiryDate("");
    setUploadNotes("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deleteLicense = async (id: string) => {
    if (!confirm("Delete this license?")) return;
    const { error } = await supabase.from("staff_licenses").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setLicenses((prev) => prev.filter((l) => l.id !== id));
  };

  const viewLicense = async (license: StaffLicense) => {
    setError("");
    const { data, error } = await supabase
      .from("staff_licenses")
      .select("file_url")
      .eq("id", license.id)
      .single();
    if (error || !data?.file_url) {
      setError(error?.message ?? "File not found.");
      return;
    }
    downloadDataUrl(data.file_url, license.fileName);
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
        {!readOnly && (
          <button
            onClick={() => setShowUpload(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <span>+</span> Add License
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Upload Modal */}
      {!readOnly && showUpload && (
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
                disabled={!selectedFile || !staffName || saving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Uploading…" : "Upload"}
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
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    Loading licenses…
                  </td>
                </tr>
              ) : licenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    No licenses on file yet. Add a food handler or first aid certificate to start
                    the expiry clock.
                  </td>
                </tr>
              ) : licenses.map((license) => {
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
                        <button
                          onClick={() => viewLicense(license)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          View
                        </button>
                        {!readOnly && (
                          <button
                            onClick={() => deleteLicense(license.id)}
                            className="text-xs text-gray-400 hover:text-red-500"
                          >
                            🗑️
                          </button>
                        )}
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
