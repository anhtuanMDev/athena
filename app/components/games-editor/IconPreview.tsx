interface IconPreviewProps {
  icon: string;
}

/** The icon as it will look, or an empty frame. */
export function IconPreview({ icon }: IconPreviewProps) {
  if (icon) {
    return (
      <div className="w-12 h-12 rounded-md border border-border shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-900 flex items-center justify-center shadow-sm">
        <img
          src={icon}
          alt="Preview"
          className="w-full h-full object-cover"
          onError={(event) => {
            // A URL that isn't a picture shows nothing rather than a broken image.
            const image = event.currentTarget;
            image.style.display = "none";
          }}
        />
      </div>
    );
  }
  return (
    <div className="w-12 h-12 rounded-md border border-dashed border-border-strong shrink-0 flex items-center justify-center text-ink-muted bg-surface-raised">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    </div>
  );
}
