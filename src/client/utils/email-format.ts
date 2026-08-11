export function subjectOrPlaceholder(subject: string): string {
  return subject.trim() === '' ? '(no subject)' : subject;
}
