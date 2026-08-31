/* Auto-fit grids leave a lonely last row (four cards become 3 + 1), which reads as a
   layout accident and wastes a whole row of the page. Pick a column count that fills
   every row instead, capped so cards never get thinner than a phrase. */
export function balancedColumns(count, maxColumns = 4) {
  if (!Number.isInteger(count) || count < 1) return 1;
  if (count <= maxColumns) return count;
  const rows = Math.ceil(count / maxColumns);
  return Math.ceil(count / rows);
}
