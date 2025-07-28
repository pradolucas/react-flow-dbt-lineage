// src/hooks/useUrlSync.ts
import { useEffect, useRef } from 'react';

interface UrlSyncProps {
  isLoading: boolean;
  focusedColumnId: string | null;
  searchQuery: string;
  selectedTags: string[];
}

export function useUrlSync({ isLoading, focusedColumnId, searchQuery, selectedTags }: UrlSyncProps) {
  const isInitialLoad = useRef(true);

  useEffect(() => {
    // Don't sync on the very first load until the initial state has been processed
    if (isLoading) return;
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (focusedColumnId) {
      params.set("column", focusedColumnId);
    } else if (searchQuery) {
      params.set("search", searchQuery);
    } else if (selectedTags.length > 0) {
      params.set("tags", selectedTags.join(","));
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
      
    window.history.replaceState({ path: newUrl }, "", newUrl);

  }, [focusedColumnId, searchQuery, selectedTags, isLoading]);
}