"use client";

import { useState, useRef } from "react";

interface Document {
  id: string;
  name: string;
  type: string;
  fileName: string;
  fileSize: string;
  uploadedAt: string;
  expiryDate: string;
  notes: string;
}

const docTypes = [
  { value: "health_license", label: "Health License", icon: "🏥" },
  { value: "insurance", label: "Insurance", icon: "🛡️" },
  { value: "business_license", label: "Business License", icon: "📋" },
  { value: "food_inspection", label: "Food Inspection Report", icon: "🔍" },
  { value: "other", label: "Other", icon: "📎" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([
    {
      id: "1",
      name: "Food Establishment License",
      type: "business_license",
      fileName: "BTB_Business_License_2026.pdf",
      fileSize: "1.2 MB",
      uploadedAt: "2026-01-15",
      expiryDate: "2027-01-15",
      notes: "Annual renewal",
    },
    {
      id: "2",
      name: "Food Safety Certificate",
      type: "health_license",
      fileName: "Health_Safety_Cert.pdf",
      fileSize: "856 KB",
      uploadedAt: "2026-03-20",
      expiryDate: "2028-03-20",
      notes: "",
    },
    {
      id: "3",
      name: "General Liability Insurance",
      type: "insurance",
      fileName: "Insurance_2026.pdf",
      fileSize: "2.1 MB",
      uploadedAt: "2026-01-10",
      expiryDate: "2027-01-10",
      notes: "General liability + property",
    },
  ]);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState("health_license");
  const [uploadName, setUploadName] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    if (!selectedFile || !uploadName) return;

    const newDoc: Document = {
      id: Date.now().toString(),
      name: uploadName,
      type: uploadType,
      fileName: selectedFile.name,
      fileSize: formatFileSize(selectedFile.size),
      uploadedAt: new Date().toISOString().split("T")[0],
      expiryDate: uploadExpiry,
      notes: uploadNotes,
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setShowUpload(false);
    setUploadName("");
    setUploadExpiry("");
    setUploadNotes("");
    setSelectedFile(null);
  };

  const deleteDocument = (id: string) => {
    if (!confirm("Delete this document?")) return;
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const getDocTypeInfo = (type: string) => {
    return docTypes.find((t) => t.value === type) || docTypes[4];
  };

  const isExpiringSoon = (expiryDate: string) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && diffDays >= 0;
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
          <h1 className="text-2xl font-bold text-gray-900">Business Documents</h1>
          <p className="text-sm text-gray-500">
            Manage health licenses, insurance, and business licenses
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Upload Document
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Upload Document</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type
                </label>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                >
                  {docTypes.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.icon} {dt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Name
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g. Food Safety Certificate"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={uploadExpiry}
                  onChange={(e) => setUploadExpiry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                />
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
                  File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
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
                disabled={!selectedFile || !uploadName}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => {
          const typeInfo = getDocTypeInfo(doc.type);
          const expiring = isExpiringSoon(doc.expiryDate);
          const expired = isExpired(doc.expiryDate);

          return (
            <div
              key={doc.id}
              className={`bg-white rounded-xl border-2 p-4 ${
                expired
                  ? "border-red-300 bg-red-50"
                  : expiring
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{typeInfo.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{doc.name}</h3>
                    <p className="text-[10px] text-gray-500">{typeInfo.label}</p>
                  </div>
                </div>
                <button
                  onClick={() => deleteDocument(doc.id)}
                  className="text-gray-400 hover:text-red-500 text-sm"
                >
                  🗑️
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">File:</span>
                  <span className="text-gray-900 truncate max-w-[180px]">
                    {doc.fileName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Size:</span>
                  <span className="text-gray-900">{doc.fileSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Uploaded:</span>
                  <span className="text-gray-900">{doc.uploadedAt}</span>
                </div>
                {doc.expiryDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Expires:</span>
                    <span
                      className={`font-bold ${
                        expired
                          ? "text-red-600"
                          : expiring
                          ? "text-amber-600"
                          : "text-gray-900"
                      }`}
                    >
                      {doc.expiryDate}
                      {expired && " (EXPIRED)"}
                      {expiring && " (Expiring Soon)"}
                    </span>
                  </div>
                )}
                {doc.notes && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Notes:</span>
                    <span className="text-gray-900">{doc.notes}</span>
                  </div>
                )}
              </div>

              <button className="w-full mt-3 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200">
                View / Download
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
