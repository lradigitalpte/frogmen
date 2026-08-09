export interface ProfileNavItem {
  label: string;
  href?: string;
  disabled?: boolean;
  badge?: string;
}

export interface ProfileNavGroup {
  title: string;
  items: ProfileNavItem[];
}

export const profileNavGroups: ProfileNavGroup[] = [
  {
    title: "Account",
    items: [
      {
        label: "Overview",
        href: "/dashboard/profile",
      },
      {
        label: "Profile information",
        href: "/dashboard/profile/information",
      },
      {
        label: "Assigned tasks",
        href: "/dashboard/profile/tasks",
      },
      {
        label: "My expense claims",
        href: "/dashboard/profile/expense-claims",
      },
    ],
  },
  {
    title: "Security",
    items: [
      {
        label: "Password & security",
        href: "/dashboard/profile/security",
      },
      {
        label: "Active sessions",
        href: "/dashboard/profile/sessions",
      },
    ],
  },
];
