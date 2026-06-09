"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionRole } from "@/lib/permissions";
import { createTherapistTransferForBooking } from "@/server/services/therapist-transfer.service";

export async function retryTherapistTransferAction(formData: FormData) {
  const paymentId = String(formData.get("paymentId") ?? "").trim();
  const adminUser = await requireActionRole(
    [UserRole.ADMIN],
    "Only admin accounts can retry therapist transfers.",
  );

  if (!paymentId) {
    return;
  }

  const payment = await prisma.payment.findUnique({
    where: {
      id: paymentId,
    },
    select: {
      bookingId: true,
    },
  });

  if (!payment) {
    return;
  }

  await createTherapistTransferForBooking(payment.bookingId, adminUser.id);

  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");
  revalidatePath(`/admin/bookings/${payment.bookingId}`);
  revalidatePath("/therapist/requests");
  revalidatePath("/therapist/dashboard");
}
