export function matchesBoardFilter(
  task: { searchText: string; tags: { id: number }[] },
  filter: { text: string; tagIds: number[] },
): boolean {
  const trimmedText = filter.text.trim().toLowerCase();
  const matchesText = trimmedText === '' || task.searchText.includes(trimmedText);
  const matchesTags = filter.tagIds.length === 0 || task.tags.some((tag) => filter.tagIds.includes(tag.id));
  return matchesText && matchesTags;
}
