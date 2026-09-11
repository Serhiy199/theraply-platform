"use client";

import { useActionState } from "react";
import { updatePublicProfileAction } from "@/app/therapist/dashboard/actions";
import { Button } from "@/components/ui/button";
import type { PublicProfileActionState, TherapistPublicProfileInput } from "@/lib/validations/therapist-public-profile";

type Props = { profile: { [K in keyof TherapistPublicProfileInput]: string | null } & { profilePhotoUrl: string | null } };
const initialState: PublicProfileActionState = { status: "idle" };
const inputClass = "mt-2 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-2 focus:outline-blue-600";

export function TherapistPublicProfileForm({ profile }: Props) {
  const [state, action, pending] = useActionState(updatePublicProfileAction, initialState);
  const missing = [!profile.bio?.trim() && "Bio", !profile.profilePhotoUrl && "Photo"].filter(Boolean);
  return (
    <section id="public-profile" className="border-t border-slate-200 py-8">
      <h2 className="text-xl font-semibold text-slate-900">Public profile</h2>
      {missing.length > 0 && <p className="mt-2 text-sm text-amber-800">Missing: {missing.join(", ")}</p>}
      <a href="#profile-photo" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
        {profile.profilePhotoUrl ? "Edit profile photo" : "Add profile photo"}
      </a>
      <form action={action} className="mt-5 grid min-w-0 gap-5 md:grid-cols-2">
        <label className="min-w-0 text-sm font-medium text-slate-800 md:col-span-2">
          Bio
          <textarea name="bio" required maxLength={10000} rows={6} defaultValue={profile.bio ?? ""} className={inputClass} />
        </label>
        <label className="min-w-0 text-sm font-medium text-slate-800">
          Specialization
          <textarea name="specialization" required maxLength={1000} rows={3} defaultValue={profile.specialization ?? ""} className={inputClass} />
        </label>
        <label className="min-w-0 text-sm font-medium text-slate-800">
          Therapy services
          <textarea name="therapyServicesProvided" required maxLength={3000} rows={3} defaultValue={profile.therapyServicesProvided ?? ""} className={inputClass} />
        </label>
        <label className="min-w-0 text-sm font-medium text-slate-800">
          Years of experience
          <input name="yearsOfExperience" type="number" min={0} max={80} step={1} required defaultValue={profile.yearsOfExperience ?? ""} className={inputClass} />
        </label>
        <div className="flex flex-wrap items-center gap-4 md:col-span-2">
          <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save public profile"}</Button>
          {state.message && <p role={state.status === "error" ? "alert" : "status"} className="text-sm text-slate-700">{state.message}</p>}
        </div>
      </form>
    </section>
  );
}
