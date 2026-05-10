export const parseNumber = (val: string | number | null | undefined): number | undefined => {
  if (val === '' || val === null || val === undefined) return undefined;
  const cleaned = typeof val === 'string' ? val.replace(/,/g, '') : String(val);
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
};
