// src/components/Header/TagFilter.tsx
import React from 'react';
import styles from './Header.module.css';

interface TagFilterProps {
  availableTags: string[];
  selectedTags: string[];
  onTagSelectionChange: (tag: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const TagFilter: React.FC<TagFilterProps> = ({ availableTags, selectedTags, onTagSelectionChange, isOpen, onToggle }) => {
  return (
    <div className={styles.tagWrapper}>
      <div
        onClick={onToggle}
        title="Filter by Tag"
        className={`${styles.tagButton} ${selectedTags.length > 0 ? styles.tagButtonActive : ''}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
          <line x1="7" y1="7" x2="7.01" y2="7"></line>
        </svg>
        {selectedTags.length > 0 && (
          <span className={styles.tagCountBadge}>
            {selectedTags.length}
          </span>
        )}
      </div>
      {isOpen && (
        <div className={styles.tagDropdown}>
          {availableTags.map((tag) => (
            <div
              key={tag}
              className={`${styles.tagDropdownItem} ${selectedTags.includes(tag) ? styles.tagDropdownItemSelected : ''}`}
              onClick={() => onTagSelectionChange(tag)}
            >
              <input
                type="checkbox"
                checked={selectedTags.includes(tag)}
                readOnly
                className={styles.tagCheckbox}
              />
              <label>{tag}</label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};