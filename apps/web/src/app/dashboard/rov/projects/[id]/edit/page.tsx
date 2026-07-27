"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RovProjectForm } from "@/components/rov/rov-project-form";
import { getRovProject } from "@/lib/rov-api";
import type { RovProject } from "@/types/rov";

export default function Page() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<RovProject | null>(null);

  useEffect(() => {
    void getRovProject(projectId).then(setProject);
  }, [projectId]);

  if (!project) return null;

  return <RovProjectForm project={project} />;
}
