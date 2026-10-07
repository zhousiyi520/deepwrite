/** Renders a minimal whitespace-aligned text table. Values print as-is. */
export function renderTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column]?.length ?? 0))
  );
  const formatRow = (cells: readonly string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd();
  return [formatRow(headers), ...rows.map(formatRow)].join("\n");
}
