"use client";

interface ReportLightboxProps {
  url: string | null;
  onClose: () => void;
}

export function ReportLightbox({ url, onClose }: ReportLightboxProps) {
  if (!url) return null;

  return (
    <div
      className="client-report__overlay no-print"
      role="dialog"
      aria-modal
      aria-label="Image preview"
      onClick={onClose}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <img src={url} alt="" className="client-report__lightbox-image" />
      <button type="button" className="client-report__lightbox-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

interface ReportPlanViewModalProps {
  open: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

export function ReportPlanViewModal({ open, imageUrl, onClose }: ReportPlanViewModalProps) {
  if (!open) return null;

  return (
    <div
      className="client-report__overlay client-report__overlay--modal no-print"
      role="dialog"
      aria-modal
      aria-label="Plan view"
      onClick={onClose}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div
        className="client-report__modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="client-report__modal-head">
          <h2>Plan View</h2>
          <button type="button" className="client-report__modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="client-report__modal-body">
          {imageUrl ? (
            <img src={imageUrl} alt="Plan view" className="client-report__plan-image" />
          ) : (
            <p className="client-report__modal-empty">No plan view image available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
