"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  saveTherapistOnboardingDraftAction,
  submitTherapistOnboardingForReviewAction,
} from "@/app/therapist/onboarding/actions";
import type { TherapistOnboardingActionState } from "@/app/therapist/onboarding/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CERTIFICATE_ALLOWED_FORMATS,
  CERTIFICATE_FILE_TOO_LARGE_MESSAGE,
  CERTIFICATE_MAX_FILE_SIZE_BYTES,
  CERTIFICATE_MAX_FILE_SIZE_LABEL,
} from "@/lib/constants/certificate-upload";
import {
  THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS,
  THERAPIST_PROFILE_PHOTO_ALLOWED_MIME_TYPES,
  THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE_MESSAGE,
  THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES,
  THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_LABEL,
} from "@/lib/constants/therapist-profile-photo";

const genderOptions = ["Female", "Male", "Other", "Prefer not to say"] as const;

type TherapistCertificateListItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  publicId: string;
  storageProvider: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
};

type TherapistOnboardingFormValues = {
  nameAndSurname: string;
  gender: string;
  email: string;
  contactNumber: string;
  therapyServicesProvided: string;
  yearsOfExperience: string;
  educationAndCertifications: string;
  specialisation: string;
  pricePerHour: string;
  profilePhotoUrl: string | null;
  certificates: TherapistCertificateListItem[];
  displayName: string;
  bio: string;
  specialization: string;
};

type TherapistOnboardingFormProps = {
  initialValues: TherapistOnboardingFormValues;
};

const initialActionState: TherapistOnboardingActionState = {
  status: "idle",
};

type CertificateUploadState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: {
    certificates?: string[];
  };
};

type ProfilePhotoUploadState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: {
    profilePhoto?: string[];
  };
};

type CertificateUploadSignatureResponse = {
  success: true;
  upload: {
    apiKey: string;
    timestamp: number;
    signature: string;
    publicId: string;
    allowedFormats: string;
    uploadUrl: string;
  };
};

type ProfilePhotoUploadSignatureResponse = {
  success: true;
  upload: {
    apiKey: string;
    timestamp: number;
    signature: string;
    publicId: string;
    allowedFormats: string;
    uploadUrl: string;
  };
};

type CloudinaryDirectUploadResponse = {
  public_id?: unknown;
  version?: unknown;
  signature?: unknown;
  resource_type?: unknown;
};

const initialUploadState: CertificateUploadState = {
  status: "idle",
};

const initialProfilePhotoUploadState: ProfilePhotoUploadState = {
  status: "idle",
};

const fieldClassName =
  "mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 disabled:bg-slate-50 disabled:text-slate-500";

const textareaClassName =
  "mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-900";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) {
    return null;
  }

  return <p className="mt-2 text-sm text-rose-700">{messages[0]}</p>;
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-900">
      {children}
    </label>
  );
}

function getStatusAlert(state: { status: "idle" | "success" | "error"; message?: string }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <Alert tone={state.status === "success" ? "success" : "error"}>
      {state.message}
    </Alert>
  );
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "Unknown size";
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatUploadDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

async function getUploadResponseError(response: Response, fallbackMessage: string) {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;

  return typeof body?.error === "string" ? body.error : fallbackMessage;
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.trim().toLowerCase() ?? "";
}

function hasAllowedCertificateFileType(file: File) {
  return CERTIFICATE_ALLOWED_FORMATS.some((extension) => extension === getFileExtension(file.name));
}

function hasAllowedProfilePhotoFileType(file: File) {
  const extension = getFileExtension(file.name);

  return (
    THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS.some((format) => format === extension) &&
    THERAPIST_PROFILE_PHOTO_ALLOWED_MIME_TYPES.some((mimeType) => mimeType === file.type)
  );
}

function getCertificateMimeType(file: File) {
  if (file.type.trim()) {
    return file.type;
  }

  switch (getFileExtension(file.name)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt":
      return "text/plain";
    default:
      return "";
  }
}

function getProfilePhotoMimeType(file: File) {
  if (file.type.trim()) {
    return file.type;
  }

  switch (getFileExtension(file.name)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "";
  }
}

function getInitials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts[0]?.[0] ?? "T") + (parts[1]?.[0] ?? "");
}

function ProfilePhotoBlock({
  currentPhotoUrl,
  displayName,
  fieldErrors,
  pending,
  uploadPending,
  setUploadPending,
  setUploadState,
}: {
  currentPhotoUrl: string | null;
  displayName: string;
  fieldErrors?: string[];
  pending: boolean;
  uploadPending: boolean;
  setUploadPending: (pending: boolean) => void;
  setUploadState: (state: ProfilePhotoUploadState) => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl);
  const [objectPreviewUrl, setObjectPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!objectPreviewUrl) {
      setPreviewUrl(currentPhotoUrl);
      return;
    }

    return () => URL.revokeObjectURL(objectPreviewUrl);
  }, [currentPhotoUrl, objectPreviewUrl]);

  function handleFileChange() {
    const file = fileInputRef.current?.files?.[0];

    setUploadState({ status: "idle" });

    if (!file) {
      setObjectPreviewUrl(null);
      setPreviewUrl(currentPhotoUrl);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setObjectPreviewUrl(nextPreviewUrl);
    setPreviewUrl(nextPreviewUrl);
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      const message = "Choose a profile photo to upload.";

      setUploadState({
        status: "error",
        message,
        fieldErrors: { profilePhoto: [message] },
      });
      return;
    }

    if (file.size > THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES) {
      setUploadState({
        status: "error",
        message: THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE_MESSAGE,
        fieldErrors: { profilePhoto: [THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE_MESSAGE] },
      });
      return;
    }

    if (!hasAllowedProfilePhotoFileType(file)) {
      const message = "Profile photo must be JPG, JPEG, PNG, or WEBP.";

      setUploadState({
        status: "error",
        message,
        fieldErrors: { profilePhoto: [message] },
      });
      return;
    }

    setUploadPending(true);
    setUploadState({ status: "idle" });

    try {
      const signatureResponse = await fetch("/api/therapist/profile-photo/upload-signature", {
        method: "POST",
      });

      if (!signatureResponse.ok) {
        throw new Error(
          await getUploadResponseError(
            signatureResponse,
            "Could not prepare profile photo upload. Please try again.",
          ),
        );
      }

      const signaturePayload = (await signatureResponse.json()) as ProfilePhotoUploadSignatureResponse;
      const cloudinaryPayload = new FormData();

      cloudinaryPayload.append("file", file);
      cloudinaryPayload.append("api_key", signaturePayload.upload.apiKey);
      cloudinaryPayload.append("timestamp", String(signaturePayload.upload.timestamp));
      cloudinaryPayload.append("public_id", signaturePayload.upload.publicId);
      cloudinaryPayload.append("allowed_formats", signaturePayload.upload.allowedFormats);
      cloudinaryPayload.append("signature", signaturePayload.upload.signature);

      const cloudinaryResponse = await fetch(signaturePayload.upload.uploadUrl, {
        method: "POST",
        body: cloudinaryPayload,
      });

      if (!cloudinaryResponse.ok) {
        throw new Error("Profile photo upload failed. Please try again.");
      }

      const cloudinaryResult =
        (await cloudinaryResponse.json()) as CloudinaryDirectUploadResponse;

      if (
        typeof cloudinaryResult.public_id !== "string" ||
        typeof cloudinaryResult.version !== "number" ||
        typeof cloudinaryResult.signature !== "string" ||
        cloudinaryResult.resource_type !== "image"
      ) {
        throw new Error("Could not verify the uploaded profile photo. Please try again.");
      }

      const confirmResponse = await fetch("/api/therapist/profile-photo/confirm-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: getProfilePhotoMimeType(file),
          publicId: cloudinaryResult.public_id,
          version: cloudinaryResult.version,
          signature: cloudinaryResult.signature,
          resourceType: "image",
        }),
      });

      if (!confirmResponse.ok) {
        throw new Error(
          await getUploadResponseError(
            confirmResponse,
            "Could not confirm profile photo upload. Please try again.",
          ),
        );
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setUploadState({
        status: "success",
        message: "Profile photo updated successfully.",
      });
      router.refresh();
    } catch (error) {
      setUploadState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while uploading the profile photo.",
      });
    } finally {
      setUploadPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid gap-5 md:grid-cols-[120px_minmax(0,1fr)] md:items-center">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-slate-100 via-sky-50 to-emerald-50 text-2xl font-semibold text-slate-700 shadow-inner shadow-white/70">
          {previewUrl ? (
            <span
              role="img"
              aria-label={`${displayName || "Therapist"} profile preview`}
              className="block h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url("${previewUrl}")` }}
            />
          ) : (
            <span aria-hidden="true">{getInitials(displayName)}</span>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Profile photo</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Upload a clear professional photo. JPG, PNG or WEBP up to{" "}
            {THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_LABEL}.
          </p>
          <input
            ref={fileInputRef}
            id="profilePhoto"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={handleFileChange}
            className="mt-3 block w-full text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-slate-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-900 file:ring-1 file:ring-slate-300 hover:file:bg-white"
          />
          <FieldError messages={fieldErrors} />
          <Button
            type="button"
            variant="secondary"
            loading={uploadPending}
            disabled={pending}
            onClick={handleUpload}
            className="mt-4"
          >
            {currentPhotoUrl ? "Replace photo" : "Upload photo"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CertificatesBlock({
  certificates,
  fieldErrors,
  pending,
  uploadPending,
  setUploadPending,
  setUploadState,
}: {
  certificates: TherapistCertificateListItem[];
  fieldErrors?: string[];
  pending: boolean;
  uploadPending: boolean;
  setUploadPending: (pending: boolean) => void;
  setUploadState: (state: CertificateUploadState) => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setUploadState({
        status: "error",
        message: "Choose at least one certificate file to upload.",
        fieldErrors: { certificates: ["Choose at least one certificate file to upload."] },
      });
      return;
    }

    if (file.size > CERTIFICATE_MAX_FILE_SIZE_BYTES) {
      setUploadState({
        status: "error",
        message: CERTIFICATE_FILE_TOO_LARGE_MESSAGE,
        fieldErrors: { certificates: [CERTIFICATE_FILE_TOO_LARGE_MESSAGE] },
      });
      return;
    }

    if (!hasAllowedCertificateFileType(file)) {
      const message = "Certificate files must be JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, or TXT.";

      setUploadState({
        status: "error",
        message,
        fieldErrors: { certificates: [message] },
      });
      return;
    }

    setUploadPending(true);
    setUploadState({ status: "idle" });

    try {
      const signatureResponse = await fetch("/api/therapist/certificates/upload-signature", {
        method: "POST",
      });

      if (!signatureResponse.ok) {
        throw new Error(
          await getUploadResponseError(
            signatureResponse,
            "Could not prepare certificate upload. Please try again.",
          ),
        );
      }

      const signaturePayload = (await signatureResponse.json()) as CertificateUploadSignatureResponse;
      const cloudinaryPayload = new FormData();

      cloudinaryPayload.append("file", file);
      cloudinaryPayload.append("api_key", signaturePayload.upload.apiKey);
      cloudinaryPayload.append("timestamp", String(signaturePayload.upload.timestamp));
      cloudinaryPayload.append("public_id", signaturePayload.upload.publicId);
      cloudinaryPayload.append("allowed_formats", signaturePayload.upload.allowedFormats);
      cloudinaryPayload.append("signature", signaturePayload.upload.signature);

      const cloudinaryResponse = await fetch(signaturePayload.upload.uploadUrl, {
        method: "POST",
        body: cloudinaryPayload,
      });

      if (!cloudinaryResponse.ok) {
        throw new Error("Certificate upload failed. Please try again.");
      }

      const cloudinaryResult =
        (await cloudinaryResponse.json()) as CloudinaryDirectUploadResponse;
      const resourceType = cloudinaryResult.resource_type;

      if (
        typeof cloudinaryResult.public_id !== "string" ||
        typeof cloudinaryResult.version !== "number" ||
        typeof cloudinaryResult.signature !== "string" ||
        (resourceType !== "image" && resourceType !== "raw")
      ) {
        throw new Error("Could not verify the uploaded certificate. Please try again.");
      }

      const confirmResponse = await fetch("/api/therapist/certificates/confirm-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: getCertificateMimeType(file),
          publicId: cloudinaryResult.public_id,
          version: cloudinaryResult.version,
          signature: cloudinaryResult.signature,
          resourceType,
        }),
      });

      if (!confirmResponse.ok) {
        throw new Error(
          await getUploadResponseError(
            confirmResponse,
            "Could not confirm certificate upload. Please try again.",
          ),
        );
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setUploadState({
        status: "success",
        message: "Certificate uploaded successfully.",
      });
      router.refresh();
    } catch (error) {
      setUploadState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while uploading certificates.",
      });
    } finally {
      setUploadPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Add your certificates here
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Upload one JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, or TXT file up to{" "}
            {CERTIFICATE_MAX_FILE_SIZE_LABEL}. Add more files one at a time.
          </p>
          <input
            ref={fileInputRef}
            id="certificates"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            disabled={pending}
            onChange={() => setUploadState({ status: "idle" })}
            className="mt-3 block w-full text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-900 file:ring-1 file:ring-slate-300 hover:file:bg-slate-50"
          />
          <FieldError messages={fieldErrors} />
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={uploadPending}
          disabled={pending}
          onClick={handleUpload}
        >
          Upload file
        </Button>
      </div>

      {certificates.length ? (
        <ul className="mt-4 grid gap-3">
          {certificates.map((certificate) => (
            <li
              key={certificate.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <a
                    href={certificate.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                  >
                    {certificate.fileName}
                  </a>
                  <p className="mt-1 text-slate-500">
                    {certificate.mimeType} - {formatFileSize(certificate.size)}
                  </p>
                </div>
                <Badge variant="neutral" size="sm">
                  {formatUploadDate(certificate.uploadedAt)}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          No certificates added yet.
        </p>
      )}
    </div>
  );
}

export function TherapistOnboardingForm({
  initialValues,
}: TherapistOnboardingFormProps) {
  const [saveState, saveAction, savePending] = useActionState<
    TherapistOnboardingActionState,
    FormData
  >(saveTherapistOnboardingDraftAction, initialActionState);
  const [submitState, submitAction, submitPending] = useActionState<
    TherapistOnboardingActionState,
    FormData
  >(submitTherapistOnboardingForReviewAction, initialActionState);
  const [uploadState, setUploadState] = useState<CertificateUploadState>(initialUploadState);
  const [uploadPending, setUploadPending] = useState(false);
  const [profilePhotoUploadState, setProfilePhotoUploadState] =
    useState<ProfilePhotoUploadState>(initialProfilePhotoUploadState);
  const [profilePhotoUploadPending, setProfilePhotoUploadPending] = useState(false);
  const fieldErrors =
    submitState.status === "error" && submitState.fieldErrors
      ? submitState.fieldErrors
      : saveState.fieldErrors;
  const pending = savePending || submitPending || uploadPending || profilePhotoUploadPending;

  return (
    <form className="mt-6 space-y-6">
      <div className="grid gap-3">
        {getStatusAlert(saveState)}
        {getStatusAlert(submitState)}
        {getStatusAlert(profilePhotoUploadState)}
        {getStatusAlert(uploadState)}
      </div>

      <ProfilePhotoBlock
        currentPhotoUrl={initialValues.profilePhotoUrl}
        displayName={initialValues.displayName || initialValues.nameAndSurname}
        fieldErrors={profilePhotoUploadState.fieldErrors?.profilePhoto}
        pending={pending}
        uploadPending={profilePhotoUploadPending}
        setUploadPending={setProfilePhotoUploadPending}
        setUploadState={setProfilePhotoUploadState}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <FieldLabel htmlFor="nameAndSurname">Name &amp; Surname *</FieldLabel>
          <input
            id="nameAndSurname"
            type="text"
            value={initialValues.nameAndSurname}
            autoComplete="name"
            readOnly
            disabled
            className={fieldClassName}
          />
        </div>

        <div>
          <FieldLabel htmlFor="gender">Gender *</FieldLabel>
          <select
            id="gender"
            name="gender"
            defaultValue={initialValues.gender}
            disabled={pending}
            className={fieldClassName}
          >
            <option value="">Select gender</option>
            {genderOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors?.gender} />
        </div>

        <div>
          <FieldLabel htmlFor="email">Email *</FieldLabel>
          <input
            id="email"
            type="email"
            value={initialValues.email}
            autoComplete="email"
            readOnly
            disabled
            className={fieldClassName}
          />
        </div>

        <div>
          <FieldLabel htmlFor="contactNumber">Contact Number *</FieldLabel>
          <input
            id="contactNumber"
            name="contactNumber"
            type="text"
            defaultValue={initialValues.contactNumber}
            autoComplete="tel"
            disabled={pending}
            className={fieldClassName}
          />
          <FieldError messages={fieldErrors?.contactNumber} />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="therapyServicesProvided">
          Therapy Services Provided *
        </FieldLabel>
        <textarea
          id="therapyServicesProvided"
          name="therapyServicesProvided"
          defaultValue={initialValues.therapyServicesProvided}
          rows={5}
          disabled={pending}
          className={textareaClassName}
        />
        <FieldError messages={fieldErrors?.therapyServicesProvided} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <FieldLabel htmlFor="yearsOfExperience">Years of Experience *</FieldLabel>
          <input
            id="yearsOfExperience"
            name="yearsOfExperience"
            type="text"
            defaultValue={initialValues.yearsOfExperience}
            disabled={pending}
            className={fieldClassName}
          />
          <FieldError messages={fieldErrors?.yearsOfExperience} />
        </div>

        <div>
          <FieldLabel htmlFor="pricePerHour">Price per Hour *</FieldLabel>
          <input
            id="pricePerHour"
            name="pricePerHour"
            type="text"
            defaultValue={initialValues.pricePerHour}
            disabled={pending}
            className={fieldClassName}
          />
          <FieldError messages={fieldErrors?.pricePerHour} />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="educationAndCertifications">
          Education &amp; Certifications *
        </FieldLabel>
        <textarea
          id="educationAndCertifications"
          name="educationAndCertifications"
          defaultValue={initialValues.educationAndCertifications}
          rows={5}
          disabled={pending}
          className={textareaClassName}
        />
        <FieldError messages={fieldErrors?.educationAndCertifications} />
      </div>

      <CertificatesBlock
        certificates={initialValues.certificates}
        fieldErrors={uploadState.fieldErrors?.certificates}
        pending={pending}
        uploadPending={uploadPending}
        setUploadPending={setUploadPending}
        setUploadState={setUploadState}
      />

      <div>
        <FieldLabel htmlFor="specialisation">Specialisation *</FieldLabel>
        <textarea
          id="specialisation"
          name="specialisation"
          defaultValue={initialValues.specialisation}
          rows={5}
          disabled={pending}
          className={textareaClassName}
        />
        <FieldError messages={fieldErrors?.specialisation} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          variant="secondary"
          loading={savePending}
          disabled={pending}
          formAction={saveAction}
        >
          Save draft
        </Button>
        <Button
          type="submit"
          loading={submitPending}
          disabled={pending}
          formAction={submitAction}
        >
          Submit for review
        </Button>
      </div>
    </form>
  );
}

export type { TherapistOnboardingFormValues };
