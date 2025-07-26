// src/components/Header/ClearButton.tsx
import React from 'react';
import styles from './Header.module.css';

interface ClearButtonProps {
  isVisible: boolean;
  onClick: () => void;
}

export const ClearButton: React.FC<ClearButtonProps> = ({ isVisible, onClick }) => {
  if (!isVisible) return null;

  return (
    <div
      onClick={onClick}
      title="Clear Filters & Selections"
      className={styles.clearButton}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </div>
  );
};
