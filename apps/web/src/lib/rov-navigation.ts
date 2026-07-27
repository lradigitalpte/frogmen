export interface RovNavItem {
  label: string;
  href?: string;
  disabled?: boolean;
  badge?: string;
}

export interface RovNavGroup {
  title: string;
  items: RovNavItem[];
}

export const rovNavGroups: RovNavGroup[] = [
  {
    title: "ROV Inspections",
    items: [
      {
        label: "Overview",
        href: "/dashboard/rov",
      },
      {
        label: "Inspection projects",
        href: "/dashboard/rov/projects",
      },
      {
        label: "Reports",
        href: "/dashboard/rov/reports",
      },
    ],
  },
];
