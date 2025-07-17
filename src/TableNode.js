// src/TableNode.js
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

// --- STYLES ---
const nodeStyle = {
  border: '1px solid #777',
  borderRadius: '5px',
  backgroundColor: '#fefefe',
  width: 250,
  fontFamily: 'Arial, sans-serif',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
};

const headerBaseStyle = {
  color: 'white',
  padding: '10px',
  borderTopLeftRadius: '5px',
  borderTopRightRadius: '5px',
  fontWeight: 'bold',
  textAlign: 'center',
};

const modelHeaderStyle = { ...headerBaseStyle, backgroundColor: '#333' };
const sourceHeaderStyle = { ...headerBaseStyle, backgroundColor: '#1a9657' };

const columnContainerStyle = { padding: '5px 0' };

const columnBaseStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 15px',
  position: 'relative',
  borderBottom: '1px solid #eee',
  transition: 'background-color 0.2s', // Smooth transition for highlighting
  cursor: 'pointer',
};

const lastColumnStyle = { ...columnBaseStyle, borderBottom: 'none' };
const columnNameStyle = { fontWeight: '500' };
const columnTypeStyle = {
  fontSize: '0.8em',
  color: '#666',
  backgroundColor: '#f0f0f0',
  padding: '2px 6px',
  borderRadius: '4px',
};

// --- COMPONENT ---
export default memo(({ data, isConnectable }) => {
  const isSource = data.resource_type === 'source';
  const headerStyle = isSource ? sourceHeaderStyle : modelHeaderStyle;

  return (
    <div style={nodeStyle}>
      <div style={headerStyle}>
        {isSource ? 'SOURCE: ' : ''}{data.label}
      </div>
      <div style={columnContainerStyle}>
        {data.columns.map((column, index) => {
          // Check if the current column is the one selected globally.
          const isSelected = data.selectedColumn === column.id;
          
          // Apply a highlight style if the column is selected.
          const dynamicColumnStyle = {
            ...columnBaseStyle,
            ...(index === data.columns.length - 1 ? { borderBottom: 'none' } : {}),
            backgroundColor: isSelected ? '#e0f7fa' : 'transparent',
          };

          return (
            <div
              key={column.id}
              style={dynamicColumnStyle}
              // When clicked, call the function passed from App.js with this column's unique ID.
              onClick={() => data.onColumnClick(column.id)}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#e0f7fa' : '#f9f9f9'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#e0f7fa' : 'transparent'}
            >
              <Handle type="target" position={Position.Left} id={column.id} isConnectable={isConnectable} style={{ top: '50%', borderRadius: 0 }} />
              <span style={columnNameStyle}>{column.name}</span>
              <span style={columnTypeStyle}>{column.type}</span>
              <Handle type="source" position={Position.Right} id={column.id} isConnectable={isConnectable} style={{ top: '50%', borderRadius: 0 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
});
