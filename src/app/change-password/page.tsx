import { UserRole } from "@prisma/client";
import { ChangePasswordPanel } from "@/components/forms/change-password-panel";
import { requireRole } from "@/lib/permissions";

export default async function ChangePasswordPage() {
  const user = await requireRole([UserRole.CLIENT, UserRole.THERAPIST, UserRole.ADMIN]);

  return <ChangePasswordPanel role={user.role} />;
}
