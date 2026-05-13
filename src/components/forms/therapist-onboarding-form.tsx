"use client";

import { useActionState } from "react";
import {
  saveTherapistOnboardingDraftAction,
  submitTherapistOnboardingForReviewAction,
  uploadTherapistCertificatesAction,
} from "@/app/therapist/onboarding/actions";
import type {
  TherapistCertificateUploadActionState,
  TherapistOnboardingActionState,
} from "@/app/therapist/onboarding/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

const initialUploadActionState: TherapistCertificateUploadActionState = {
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

function CertificatesBlock({
  certificates,
  fieldErrors,
  pending,
  uploadAction,
  uploadPending,
}: {
  certificates: TherapistCertificateListItem[];
  fieldErrors?: string[];
  pending: boolean;
  uploadAction: (formData: FormData) => void;
  uploadPending: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Add your certificates here
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Upload JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, or TXT files up to 10MB each.
          </p>
          <input
            id="certificates"
            name="certificates"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            disabled={pending}
            className="mt-3 block w-full text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-900 file:ring-1 file:ring-slate-300 hover:file:bg-slate-50"
          />
          <FieldError messages={fieldErrors} />
        </div>
        <Button
          type="submit"
          variant="secondary"
          loading={uploadPending}
          disabled={pending}
          formAction={uploadAction}
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
  const [uploadState, uploadAction, uploadPending] = useActionState<
    TherapistCertificateUploadActionState,
    FormData
  >(uploadTherapistCertificatesAction, initialUploadActionState);
  const fieldErrors =
    submitState.status === "error" && submitState.fieldErrors
      ? submitState.fieldErrors
      : saveState.fieldErrors;
  const pending = savePending || submitPending || uploadPending;

  return (
    <form className="mt-6 space-y-6" encType="multipart/form-data">
      <div className="grid gap-3">
        {getStatusAlert(saveState)}
        {getStatusAlert(submitState)}
        {getStatusAlert(uploadState)}
      </div>

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
        uploadAction={uploadAction}
        uploadPending={uploadPending}
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
