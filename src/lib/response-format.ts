export function prefersHtmlResponse(
  acceptHeader: string | undefined,
  negotiatedType: string | false,
): boolean {
  return Boolean(
    acceptHeader?.toLowerCase().includes('text/html')
    && negotiatedType === 'html',
  );
}
