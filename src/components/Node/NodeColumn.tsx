// src/components/Node/NodeColumn.tsx
import React, { useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import styles from './TableNode.module.css';
import { DataTypeIcon } from './DataTypeIcon';
import { ColumnData } from '../../types/index';

interface NodeColumnProps {
  column: ColumnData;
  isSelected: boolean;
  onColumnClick: (id: string) => void;
  isConnectable: boolean;
}

export const NodeColumn: React.FC<NodeColumnProps> = ({ column, isSelected, onColumnClick, isConnectable }) => {
  const columnClasses = `${styles.columnBase} ${isSelected ? styles.columnSelected : ""}`;
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onColumnClick(column.id);
  }, [onColumnClick, column.id]);
  
  return (
    <div className={columnClasses} onClick={handleClick}>
      <Handle type="target" position={Position.Left} id={column.id} className={styles.handle} isConnectable={isConnectable} />
      <div className={styles.columnContent}>
        <span className={styles.columnName} title={column.name}>{column.name}</span>
        <DataTypeIcon type={column.type} />
      </div>
      <Handle type="source" position={Position.Right} id={column.id} className={styles.handle} isConnectable={isConnectable} />
    </div>
  );
};