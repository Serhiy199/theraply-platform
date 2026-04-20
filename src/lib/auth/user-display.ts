export type UserDisplayData = {
  email?: string | null;
  firstName?: string;
  lastName?: string;
};

export function getUserDisplayName(user: UserDisplayData) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  return user.email ?? "Theraply user";
}

export function getUserInitials(user: UserDisplayData) {
  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((value) => value!.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  if (initials) {
    return initials;
  }

  return (user.email ?? "TU").slice(0, 2).toUpperCase();
}
