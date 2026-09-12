import "server-only";
import { prisma } from "@/lib/prisma";
import { evaluateTherapistReadiness } from "@/lib/therapist-readiness";
import { getWixCmsConfig } from "@/lib/wix/wix-cms-config";
import { getCanonicalAppBaseUrl } from "@/lib/urls/canonical-app-url";
import { findWixCmsTherapistsByTheraplyId } from "@/lib/wix/wix-cms-client";
import { reconcileTherapistPublicProfile, wixCmsTherapistProfileSelect } from "@/server/services/wix-cms-therapist-sync.service";

export const TARGETED_DEPUBLISH_CONFIRMATION = "WIX_PRODUCTION_DEPUBLISH_ONE";
export type TargetedDepublishOptions = { profileId: string; expectedWixItemId: string; confirmation: string; write?: boolean };

export function parseTargetedDepublishArgs(args: string[]): TargetedDepublishOptions {
  const values = new Map<string, string>();
  for (const arg of args) {
    const [name, ...rest] = arg.split("=");
    if (!["--profile-id", "--expected-wix-item-id", "--confirm-production", "--write"].includes(name) || values.has(name)) throw new Error("INVALID_OR_DUPLICATE_ARGUMENT");
    if (name === "--write" ? rest.length !== 0 : rest.length !== 1 || !rest[0]) throw new Error("INVALID_ARGUMENT_VALUE");
    values.set(name, name === "--write" ? "true" : rest[0]);
  }
  const result = { profileId: values.get("--profile-id") ?? "", expectedWixItemId: values.get("--expected-wix-item-id") ?? "", confirmation: values.get("--confirm-production") ?? "", write: values.has("--write") };
  validateOptions(result);
  return result;
}

function validateOptions(options: TargetedDepublishOptions) {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.profileId) || !/^[a-zA-Z0-9_-]+$/.test(options.expectedWixItemId) || options.confirmation !== TARGETED_DEPUBLISH_CONFIRMATION) throw new Error("TARGETED_DEPUBLISH_CONFIRMATION_REQUIRED");
}

export async function runTargetedWixDepublication(options: TargetedDepublishOptions) {
  validateOptions(options);
  const config = getWixCmsConfig();
  if (config.environment !== "production" || getCanonicalAppBaseUrl().origin !== "https://platform.theraply.online") throw new Error("PRODUCTION_CONTEXT_REQUIRED");
  const profile = await prisma.therapistProfile.findUnique({ where: { id: options.profileId }, select: wixCmsTherapistProfileSelect });
  if (!profile || evaluateTherapistReadiness({ user: profile.user, profile }).publicReady) throw new Error("PROFILE_MUST_EXIST_AND_BE_NON_PUBLIC");
  const matches = await findWixCmsTherapistsByTheraplyId(profile.id);
  if (matches.length !== 1 || matches[0].id !== options.expectedWixItemId || matches[0].data.theraplyId !== profile.id) throw new Error("WIX_IDENTITY_MISMATCH");
  const action = matches[0].data.isPublished === false && matches[0].data.isBookable === false ? "NO_CHANGE" : "HIDDEN";
  if (options.write) {
    // Canonical service re-reads identity/readiness and cannot CREATE in this mode.
    const result = await reconcileTherapistPublicProfile(profile.id, { expectedWixItemId: options.expectedWixItemId });
    if (result.status !== "HIDDEN" && result.status !== "NO_CHANGE") throw new Error("UNEXPECTED_DEPUBLISH_RESULT");
    return { mode: "WRITE", profileId: profile.id, wixItemId: result.wixItemId, action: result.status };
  }
  return { mode: "DRY_RUN", profileId: profile.id, wixItemId: matches[0].id, action };
}
