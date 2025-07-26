// src/components/Header/Header.tsx
import React from 'react';
import { SearchBar, SearchSuggestion } from './SearchBar';
import { TagFilter } from './TagFilter';
import { ClearButton } from './ClearButton';
import styles from './Header.module.css';
import { Node } from 'reactflow';
import { TableData } from '../../types/dbt';

interface HeaderProps {
  // Search Props
  searchQuery: string;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  suggestions: SearchSuggestion[];
  onSuggestionClick: (suggestion: SearchSuggestion) => void;
  onSearchFocus: () => void;
  allNodes: Node<TableData>[];

  // Tag Props
  availableTags: string[];
  selectedTags: string[];
  onTagSelectionChange: (tag: string) => void;
  isTagDropdownOpen: boolean;
  onToggleTagDropdown: () => void;

  // Clear Props
  showClearButton: boolean;
  onClearFilters: () => void;
  
  // Lineage Date
  lineageDate: string;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  suggestions,
  onSuggestionClick,
  onSearchFocus,
  allNodes,
  availableTags,
  selectedTags,
  onTagSelectionChange,
  isTagDropdownOpen,
  onToggleTagDropdown,
  showClearButton,
  onClearFilters,
  lineageDate,
}) => {
    
  const formattedDate = lineageDate
    ? new Date(lineageDate).toLocaleString()
    : "N/A";

  return (
    <>
      <div className={styles.headerContainer}>
        <div className={styles.filterControls}>
          <SearchBar
            query={searchQuery}
            onChange={onSearchChange}
            suggestions={suggestions}
            onSuggestionClick={onSuggestionClick}
            onFocus={onSearchFocus}
          />
          <TagFilter
            availableTags={availableTags}
            selectedTags={selectedTags}
            onTagSelectionChange={onTagSelectionChange}
            isOpen={isTagDropdownOpen}
            onToggle={onToggleTagDropdown}
          />
          <ClearButton
            isVisible={showClearButton}
            onClick={onClearFilters}
          />
        </div>
      </div>
      {lineageDate && (
        <div className={styles.lastUpdatedInfo}>
          <strong>Last Updated:</strong> {formattedDate}
        </div>
      )}
    </>
  );
};