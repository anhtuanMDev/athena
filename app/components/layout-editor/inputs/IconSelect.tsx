interface IconSelectProps {
  label: string;
  value: string | undefined;
  icons: string[];
  className: string;
  onChange: (icon: string | undefined) => void;
}

/** A tile's or a row's icon, from the app's icon names. */
export function IconSelect({ label, value, icons, className, onChange }: IconSelectProps) {
  return (
    <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className={className}>
      <option value="">No icon</option>
      {icons.map((icon) => (
        <option key={icon} value={icon}>{icon}</option>
      ))}
    </select>
  );
}
