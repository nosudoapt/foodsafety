"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  restaurant_name: string;
  role: "owner" | "manager" | "staff";
  created_at: string;
  updated_at: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [editForm, setEditForm] = useState({
    full_name: "",
    restaurant_name: "",
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push("/auth/sign-in");
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (data) {
      setProfile(data);
      setEditForm({
        full_name: data.full_name || "",
        restaurant_name: data.restaurant_name || "",
      });
    }
    setLoading(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editForm.full_name,
        restaurant_name: editForm.restaurant_name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    if (error) {
      setMessage({ type: "error", text: "Failed to update profile." });
    } else {
      setMessage({ type: "success", text: "Profile updated successfully." });
      fetchProfile();
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/sign-in");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and profile</p>
      </div>

      {/* Profile Section */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Profile Information</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-green-600">
                {profile?.full_name?.charAt(0) ||
                  profile?.email?.charAt(0) ||
                  "U"}
              </span>
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {profile?.full_name || "No name set"}
              </p>
              <p className="text-sm text-gray-600">{profile?.email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full capitalize">
                {profile?.role}
              </span>
            </div>
          </div>

          <form onSubmit={handleUpdate} className="space-y-4">
            {message.text && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  message.type === "error"
                    ? "bg-red-50 text-red-600"
                    : "bg-green-50 text-green-600"
                }`}
              >
                {message.text}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={editForm.full_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, full_name: e.target.value })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Restaurant Name
              </label>
              <input
                type="text"
                value={editForm.restaurant_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, restaurant_name: e.target.value })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Enter your restaurant name"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>

      {/* Account Settings */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Account Settings</h2>
        </div>
        <div className="divide-y divide-gray-200">
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Email Address</p>
              <p className="text-sm text-gray-600">{profile?.email}</p>
            </div>
            <span className="text-xs text-gray-400">Cannot be changed</span>
          </div>
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Role</p>
              <p className="text-sm text-gray-600 capitalize">
                {profile?.role}
              </p>
            </div>
            <Link
              href="/auth/reset-password"
              className="text-sm text-green-600 hover:underline font-medium"
            >
              Reset Password
            </Link>
          </div>
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Member Since</p>
              <p className="text-sm text-gray-600">
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString()
                  : "Unknown"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4">
          <button
            onClick={handleSignOut}
            className="w-full bg-red-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
