type FilterSource = (
  iterator: (_tiddler: unknown, title: string) => void,
) => void;

interface FilterOperator {
  operand?: string;
}

export const shuffle = (
  source: FilterSource,
  operator: FilterOperator,
): string[] => {
  const results: string[] = [];

  source((_tiddler, title) => {
    results.push(title);
  });

  const parsedOperand = Number.parseInt(operator.operand ?? '', 10);
  const targetCount = Math.min(
    Math.max(0, Number.isNaN(parsedOperand) ? Number.POSITIVE_INFINITY : parsedOperand),
    results.length,
  );

  for (let index = 0; index < targetCount; index += 1) {
    const swapIndex = Math.floor(Math.random() * (results.length - index)) + index;
    [results[index], results[swapIndex]] = [results[swapIndex], results[index]];
  }

  return results.slice(0, targetCount);
};