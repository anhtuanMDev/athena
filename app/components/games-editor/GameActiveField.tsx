interface GameActiveFieldProps {
  isActive: boolean;
  onChange: (isActive: boolean) => void;
}

/** Whether players see the game. */
export function GameActiveField({ isActive, onChange }: GameActiveFieldProps) {
  return (
    <div className="pt-6 border-t border-border">
      <label className="flex items-center gap-3 p-3 -mx-3 rounded-lg hover:bg-surface-raised cursor-pointer transition-colors border border-transparent dark:hover:border-gray-800">
        <input
          type="checkbox"
          name="active"
          value="true"
          checked={isActive}
          onChange={(event) => { onChange(event.target.checked); }}
          className="rounded border-border-strong bg-surface w-5 h-5 text-orange-600 focus:ring-orange-500"
        />
        <div>
          <span className="block text-sm font-medium text-ink">Active Status</span>
          <span className="block text-xs text-ink-muted">Determine if this game is visible across the platform.</span>
        </div>
      </label>
    </div>
  );
}
