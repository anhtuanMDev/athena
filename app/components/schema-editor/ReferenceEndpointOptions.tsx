interface ReferenceEndpointOptionsProps {
  endpoint: string;
  referenceOptions: string[];
}

/** A reference's endpoint choices: the game's categories, and the field's own when it's none of them. */
export function ReferenceEndpointOptions({ endpoint, referenceOptions }: ReferenceEndpointOptionsProps) {
  return (
    <>
      <option value="" disabled>
        Select API Endpoint
      </option>
      {endpoint !== "" && !referenceOptions.includes(endpoint) && <option value={endpoint}>{endpoint} (not a category)</option>}
      {referenceOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </>
  );
}
