import { useEffect } from 'react';

const APP_NAME = 'Courier Integration Platform';

// Sets the browser tab title for the current page.
export function useDocumentTitle(pageTitle: string): void {
  useEffect(() => {
    document.title = `${pageTitle} | ${APP_NAME}`;
  }, [pageTitle]);
}
