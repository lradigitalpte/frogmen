export function getCustomerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getCustomerAvatarUrl(avatarPath: string | null | undefined) {
  if (!avatarPath) {
    return undefined;
  }

  const segments = avatarPath.split("/");

  if (segments.length < 3 || segments[0] !== "avatars") {
    return undefined;
  }

  const [, organizationId, fileName] = segments;

  return `/api/v1/files/avatars/${organizationId}/${fileName}`;
}

export function formatCustomerDate(value: string | null | undefined) {
  if (!value) {
    return " ";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
