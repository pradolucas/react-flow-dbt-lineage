// src/components/Header/SearchBar.tsx
import React, { useState } from 'react';
import styles from './Header.module.css';

export interface SearchSuggestion {
  type: 'table' | 'column';
  label?: string;
  tableLabel?: string;
  columnLabel?: string;
  columnId?: string;
}

interface SearchBarProps {
  query: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  suggestions: SearchSuggestion[];
  onSuggestionClick: (suggestion: SearchSuggestion) => void;
  onFocus: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ query, onChange, suggestions, onSuggestionClick, onFocus }) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus();
  };

  return (
    <div className={styles.searchWrapper}>
      <div className={`${styles.searchContainer} ${isFocused ? styles.searchContainerFocused : ''}`}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.searchIcon}>
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          id="search"
          type="text"
          value={query}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Search table or column..."
          className={styles.searchInput}
          autoComplete="off"
        />
      </div>
      {isFocused && suggestions.length > 0 && (
        <ul className={styles.suggestionsList}>
          {suggestions.map((s, i) => (
            <li
              key={`${s.label || s.columnLabel}-${i}`}
              onClick={() => onSuggestionClick(s)}
              className={styles.suggestionItem}
            >
              {s.type === 'column' ? (
                <span>
                  {s.tableLabel} &gt; <strong>{s.columnLabel}</strong>
                </span>
              ) : (
                s.label
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};