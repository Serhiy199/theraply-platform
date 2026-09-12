"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { requireActionActiveTherapistFeatures } from "@/lib/permissions";
import { therapistPublicProfileSchema, type PublicProfileActionState } from "@/lib/validations/therapist-public-profile";
import { updateTherapistPublicProfile } from "@/server/services/therapist-public-profile.service";

export async function updatePublicProfileAction(
  _previous: PublicProfileActionState, formData: FormData,
): Promise<PublicProfileActionState> {
  try {
    const user = await requireActionActiveTherapistFeatures(await getCurrentUser());
    // React may include its own action metadata, but no caller-supplied business fields are dropped.
    const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      return { status: "error", message: "Invalid profile fields." };
    }
    const parsed = therapistPublicProfileSchema.safeParse(Object.fromEntries(entries));
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the profile fields." };
    await updateTherapistPublicProfile(user.id, parsed.data);
    revalidatePath("/therapist/dashboard");
    revalidatePath("/client/book/new");
    revalidatePath(`/client/book/${user.id}`);
    return { status: "success", message: "Public profile saved." };
  } catch {
    return { status: "error", message: "Unable to save your profile. Check your account access and try again." };
  }
}
