// src/components/Node/TableNode.tsx
import React, { memo, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import styles from "./TableNode.module.css";
import { DataTypeIcon } from "./DataTypeIcon";
import { ColumnData, TableNodeData } from "../../types/dbt";

export const MAX_COLUMNS_COLLAPSED = 3;

// --- SUB-COMPONENTS ---

const NodeHeader: React.FC<{ data: TableNodeData }> = ({ data }) => {
  const isSource = data.resource_type === "source";
  const headerClass = isSource ? styles.sourceHeader : styles.modelHeader;

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
     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    </svg>
  );

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
        <a href={data.dbtDocsUrl} target="_blank" rel="noopener noreferrer" title={`Open docs for ${data.label}`} onClick={(e) => e.stopPropagation()} className={styles.docsLink}>
          <DocsIcon />
        </a>
      )}
    </div>
  );
};

const Column: React.FC<{ column: ColumnData; isSelected: boolean; onColumnClick: (id: string) => void; isConnectable: boolean; }> = ({ column, isSelected, onColumnClick, isConnectable }) => {
  const columnClasses = `${styles.columnBase} ${isSelected ? styles.columnSelected : ""}`;
  
  return (
    <div className={columnClasses} onClick={(e) => { e.stopPropagation(); onColumnClick(column.id); }}>
      <Handle type="target" position={Position.Left} id={column.id} className={styles.handle} isConnectable={isConnectable} />
      <div className={styles.columnContent}>
        <span className={styles.columnName} title={column.name}>{column.name}</span>
        <DataTypeIcon type={column.type} />
      </div>
      <Handle type="source" position={Position.Right} id={column.id} className={styles.handle} isConnectable={isConnectable} />
    </div>
  );
};

const NodeFooter: React.FC<{ tags: string[] }> = ({ tags }) => {
  if (!tags || tags.length === 0) return null;
  return (
    <div className={styles.tagsFooter}>
      {tags.map((tag) => (
        <span key={tag} className={styles.tag}>{tag}</span>
      ))}
    </div>
  );
};

const LineageButton: React.FC<{ onClick: (e: React.MouseEvent) => void }> = ({ onClick }) => (
    <div title="Reveal Lineage" className={styles.lineageButton} onClick={onClick}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15"></line>
            <circle cx="18" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <path d="M18 9a9 9 0 0 1-9 9"></path>
        </svg>
    </div>
);


// --- MAIN COMPONENT ---
const TableNode: React.FC<NodeProps<TableNodeData>> = ({ id, data, selected, isConnectable }) => {
  const [columnSearch, setColumnSearch] = useState("");
  const [isHovered, setIsHovered] = useState(false);

  const nodeClasses = `${styles.node} ${selected ? styles.nodeHighlight : ""}`;

  let columnsToShow: ColumnData[];
  let isColumnFocused = false;
  const focusedColumn = data.columns.find((c) => c.id === data.focusedColumnId);

  if (focusedColumn) {
    columnsToShow = [focusedColumn];
    isColumnFocused = true;
  } else {
    const filteredColumns = data.columns.filter((col) =>
      col.name.toLowerCase().includes(columnSearch.toLowerCase())
    );
    const hasManyColumns = filteredColumns.length > MAX_COLUMNS_COLLAPSED;
    columnsToShow =
      hasManyColumns && !data.isExpanded
        ? filteredColumns.slice(0, MAX_COLUMNS_COLLAPSED)
        : filteredColumns;
  }

  const filteredColumns = data.columns.filter((col) =>
    col.name.toLowerCase().includes(columnSearch.toLowerCase())
  );
  const hasManyColumns = filteredColumns.length > MAX_COLUMNS_COLLAPSED;

  return (
    <div className={nodeClasses} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <Handle type="target" position={Position.Left} id="table-dependency-target" className={styles.tableHandle} isConnectable={isConnectable} />
      <Handle type="source" position={Position.Right} id="table-dependency-source" className={styles.tableHandle} isConnectable={isConnectable} />

      {isHovered && <LineageButton onClick={(e) => { e.stopPropagation(); data.onRevealNeighbors(id); }} />}

      <NodeHeader data={data} />

      {!isColumnFocused && (
        <>
          <div className={styles.columnSearchWrapper}>
             <span className={styles.searchIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
             </span>
            <input
              type="text"
              placeholder="Search columns..."
              value={columnSearch}
              onChange={(e) => setColumnSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className={styles.columnSearchInput}
            />
          </div>
          {hasManyColumns && (
            <div className={styles.expander} onClick={(e) => { e.stopPropagation(); data.onToggleExpand(id); }} title={data.isExpanded ? "Hide columns" : "Show more columns"}>
              {data.isExpanded ? (
                <>
                  <span className={styles.expanderText}>Hide</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </>
              ) : (
                <>
                  <span className={styles.expanderText}>{`Show ${filteredColumns.length - MAX_COLUMNS_COLLAPSED} more`}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </>
              )}
            </div>
          )}
        </>
      )}

      <div className={styles.columnContainer}>
        {columnsToShow.map((column) => (
          <Column
            key={column.id}
            column={column}
            isSelected={data.selectedColumns.includes(column.id)}
            onColumnClick={data.onColumnClick}
            isConnectable={!!isConnectable}
          />
        ))}
      </div>

      <NodeFooter tags={data.tags} />
    </div>
  );
};

export default memo(TableNode);