type TherapistProfilePhotoProps = {
  displayName: string;
  profilePhotoUrl?: string | null;
  className?: string;
  initialsClassName?: string;
};

function getInitials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts[0]?.[0] ?? "T") + (parts[1]?.[0] ?? "");
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function TherapistProfilePhoto({
  displayName,
  profilePhotoUrl,
  className,
  initialsClassName,
}: TherapistProfilePhotoProps) {
  return (
    <div
      className={joinClasses(
        "flex items-center justify-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-slate-100 via-sky-50 to-emerald-50 font-semibold text-slate-700 shadow-inner shadow-white/70",
        className,
      )}
    >
      {profilePhotoUrl ? (
        <span
          role="img"
          aria-label={`${displayName} profile photo`}
          className="block h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url("${profilePhotoUrl}")` }}
        />
      ) : (
        <span aria-hidden="true" className={initialsClassName}>
          {getInitials(displayName)}
        </span>
      )}
    </div>
  );
}
