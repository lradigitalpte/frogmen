"use client";

interface ReportTabIntroProps {
  title: string;
  description?: string;
  count?: number;
  countLabel?: string;
}

export function ReportTabIntro({ title, description, count, countLabel }: ReportTabIntroProps) {
  return (
    <div className="client-report__tab-intro">
      <div>
        <h2 className="client-report__tab-intro-title">{title}</h2>
        {description ? <p className="client-report__tab-intro-desc">{description}</p> : null}
      </div>
      {count != null ? (
        <span className="client-report__tab-intro-count">
          {count} {countLabel ?? "items"}
        </span>
      ) : null}
    </div>
  );
}
