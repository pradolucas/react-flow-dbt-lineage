// src/components/Node/TableNode.tsx
import React, { memo, useState, useCallback } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import styles from "./TableNode.module.css";
import { ColumnData, TableNodeData } from "../../types/index";
import { NodeHeader } from './NodeHeader';
import { NodeColumn } from './NodeColumn';

export const MAX_COLUMNS_COLLAPSED = 3;

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
    <div title="Reveal Lineage" className={`${styles.lineageButton} nodrag`} onClick={onClick}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15"></line>
            <circle cx="18" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <path d="M18 9a9 9 0 0 1-9 9"></path>
        </svg>
    </div>
);

const TableNode: React.FC<NodeProps<TableNodeData>> = ({ id, data, selected, isConnectable }) => {
  const [columnSearch, setColumnSearch] = useState("");
  const [isHovered, setIsHovered] = useState(false);

  const nodeClasses = `${styles.node} ${selected ? styles.nodeHighlight : ""}`;

  const handleLineageButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    data.onRevealNeighbors(id);
  }, [data, id]);

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    data.onToggleExpand(id);
  }, [data, id]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setColumnSearch(e.target.value);
  }, []);
  
  const handleSearchClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // **NEW**: Logic to determine which columns to show has been updated
  let columnsToRender: ColumnData[];
  if (data.visibleColumnIds) {
    // If a specific set of columns is passed, show only them.
    columnsToRender = data.columns.filter(col => data.visibleColumnIds!.has(col.id));
  } else {
    // Otherwise, use the local column search input to filter.
    columnsToRender = data.columns.filter((col) => col.name.toLowerCase().includes(columnSearch.toLowerCase()));
  }

  const showColumnControls = !data.visibleColumnIds;
  const hasManyColumns = showColumnControls && columnsToRender.length > MAX_COLUMNS_COLLAPSED;
  const columnsToShow = hasManyColumns && !data.isExpanded 
    ? columnsToRender.slice(0, MAX_COLUMNS_COLLAPSED) 
    : columnsToRender;

  return (
    <div className={nodeClasses} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <Handle type="target" position={Position.Left} id="table-dependency-target" className={styles.tableHandle} isConnectable={isConnectable} />
      <Handle type="source" position={Position.Right} id="table-dependency-source" className={styles.tableHandle} isConnectable={isConnectable} />

      {isHovered && <LineageButton onClick={handleLineageButtonClick} />}

      <NodeHeader data={data} />
      
      {/* **NEW**: The column search and expander are now hidden when a column is focused */}
      {showColumnControls && (
        <>
          <div className={`${styles.columnSearchWrapper} nodrag`}>
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
              onChange={handleSearchChange}
              onClick={handleSearchClick}
              className={styles.columnSearchInput}
            />
          </div>
          {hasManyColumns && (
            <div className={`${styles.expander} nodrag`} onClick={handleToggleExpand} title={data.isExpanded ? "Hide columns" : "Show more columns"}>
              {data.isExpanded ? (
                <>
                  <span className={styles.expanderText}>Hide</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </>
              ) : (
                <>
                  <span className={styles.expanderText}>{`Show ${columnsToRender.length - MAX_COLUMNS_COLLAPSED} more`}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </>
              )}
            </div>
          )}
        </>
      )}

      <div className="nodrag">
        {columnsToShow.map((column) => (
          <NodeColumn
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