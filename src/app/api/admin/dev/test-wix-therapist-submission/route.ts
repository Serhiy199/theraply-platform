import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { WixApiRequestError, WixConfigError } from "@/lib/wix/wix-client";
import {
  ActionPermissionError,
  requireCurrentActionRole,
} from "@/lib/permissions";
import {
  createWixTherapistApplicationSubmission,
  type WixTherapistApplicationInput,
  WixFormsServiceError,
} from "@/server/services/wix-forms.service";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";

export const runtime = "nodejs";

const TEST_WIX_THERAPIST_SUBMISSION: WixTherapistApplicationInput = {
  nameAndSurname: "Test Therapist Sync",
  gender: "Female",
  email: "test.therapist.sync@example.com",
  contactNumber: "+44 7000 000000",
  therapyServicesProvided: "Personal therapy",
  yearsOfExperience: "5",
  educationAndCertifications: "Test education and certifications",
  certificates: "No certificates attached in test submission",
  specialisation: "Anxiety, stress, relationship difficulties",
  pricePerHour: "50",
};

const GENERIC_WIX_TEST_ERROR =
  "Перевірте налаштування Wix API або структуру форми.";

function testSubmissionErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      message: "Не вдалося створити тестовий запис у Wix Forms.",
      error,
    },
    { status },
  );
}

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return testSubmissionErrorResponse("Потрібна авторизація адміністратора.", 401);
  }

  let adminUser: Awaited<ReturnType<typeof requireCurrentActionRole>>;

  try {
    adminUser = await requireCurrentActionRole(
      currentUser,
      [UserRole.ADMIN],
      "Only admin accounts can create a test Wix therapist submission.",
    );
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return testSubmissionErrorResponse("Доступ дозволено лише адміністратору.", 403);
    }

    throw error;
  }

  try {
    const result = await createWixTherapistApplicationSubmission(
      TEST_WIX_THERAPIST_SUBMISSION,
    );

    return NextResponse.json(
      {
        success: true,
        message: "Тестовий запис успішно створено у Wix Forms.",
        wixSubmissionId: result.wixSubmissionId,
      },
      { status: 200 },
    );
  } catch (error) {
    const technicalMetadata = {
      adminUserId: adminUser.id,
      errorCode:
        error instanceof WixFormsServiceError
          ? error.code
          : error instanceof Error
            ? error.name
            : "UNKNOWN",
      wixStatus: error instanceof WixApiRequestError ? error.status : null,
      wixError: error instanceof WixApiRequestError ? error.details : null,
      details: error instanceof WixFormsServiceError ? error.details : null,
      error,
    };

    logDiagnosticEvent(
      "test-wix-therapist-submission-route",
      "Unable to create test Wix therapist submission.",
      technicalMetadata,
    );

    if (error instanceof WixConfigError) {
      return testSubmissionErrorResponse(error.message, 503);
    }

    if (
      error instanceof WixFormsServiceError &&
      error.code === "WIX_FORM_STRUCTURE_MISMATCH"
    ) {
      return testSubmissionErrorResponse(error.message, 409);
    }

    return testSubmissionErrorResponse(GENERIC_WIX_TEST_ERROR, 502);
  }
}
