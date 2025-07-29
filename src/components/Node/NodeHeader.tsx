// src/components/Node/NodeHeader.tsx
import React, { useCallback } from 'react';
import styles from './TableNode.module.css';
import { TableNodeData } from '../../types/index';

const SourceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
  </svg>
);

const ModelIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

const DocsIcon = () => (
   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

export const NodeHeader: React.FC<{ data: TableNodeData }> = ({ data }) => {
  const isSource = data.resource_type === "source";
  const headerClass = isSource ? styles.sourceHeader : styles.modelHeader;

  const handleDocsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.dbtDocsUrl) {
      window.open(data.dbtDocsUrl, '_blank', 'noopener,noreferrer');
    }
  }, [data.dbtDocsUrl]);

  return (
    <div className={`${styles.headerBase} ${headerClass}`}>
      <div className={styles.headerInfo}>
        <div className={styles.iconStyle}>{isSource ? <SourceIcon /> : <ModelIcon />}</div>
        <div className={styles.headerText} title={`${data.database}.${data.schema}.${data.label}`}>
          <div className={styles.tableName}>{data.label}</div>
          <div className={styles.dbSchema}>
            {data.database}.{data.schema}
          </div>
        </div>
      </div>
      {data.dbtDocsUrl && (
        <button
          title={`Open docs for ${data.label}`}
          onClick={handleDocsClick}
          className={`${styles.docsButton} nodrag`}
        >
          <DocsIcon />
        </button>
      )}
    </div>
  );
};