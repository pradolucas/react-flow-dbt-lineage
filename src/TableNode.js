// src/TableNode.js
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

// --- ESTILOS ---
const nodeStyle = {
  border: '1px solid #ddd',
  borderRadius: '8px',
  backgroundColor: '#fefefe',
  width: 260,
  fontFamily: "'Inter', sans-serif",
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  transition: 'border-color 0.2s, box-shadow 0.2s', // Adiciona transição para o efeito de highlight
};

// Novo estilo para o highlight do nó
const nodeHighlightStyle = {
    borderColor: '#00A4C9',
    boxShadow: '0 0 0 2px rgba(0, 164, 201, 0.2), 0 4px 12px rgba(0,0,0,0.1)',
};

const headerBaseStyle = {
  color: 'white',
  padding: '12px 15px',
  borderTopLeftRadius: '8px',
  borderTopRightRadius: '8px',
  display: 'flex',
  alignItems: 'center',
};

const modelHeaderStyle = { ...headerBaseStyle, backgroundColor: '#2d3748' };
const sourceHeaderStyle = { ...headerBaseStyle, backgroundColor: '#2f855a' };

const iconStyle = {
    marginRight: '10px',
    flexShrink: 0,
};

const tableNameStyle = {
    fontSize: '16px',
    fontWeight: '600',
};
const dbSchemaStyle = {
    fontSize: '12px',
    opacity: '0.7',
    marginTop: '2px',
};

const columnContainerStyle = { padding: '5px 0' };

const columnBaseStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '9px 15px',
  position: 'relative',
  borderBottom: '1px solid #eee',
  transition: 'background-color 0.2s',
  cursor: 'pointer',
};

const columnNameStyle = { fontWeight: '500', fontSize: '14px' };
const columnTypeStyle = {
  fontSize: '12px',
  color: '#4a5568',
  backgroundColor: '#edf2f7',
  padding: '3px 8px',
  borderRadius: '4px',
};

const tagsFooterStyle = {
    padding: '8px 12px',
    borderTop: '1px solid #eee',
    backgroundColor: '#fcfcfc',
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
};

const tagStyle = {
    display: 'inline-block',
    padding: '3px 8px',
    margin: '2px',
    fontSize: '11px',
    fontWeight: '500',
    color: '#4a5568',
    backgroundColor: '#e2e8f0',
    borderRadius: '12px',
};


// --- COMPONENTE ---
// Adiciona a propriedade 'selected' que é fornecida pelo React Flow
export default memo(({ data, isConnectable, selected }) => {
  const isSource = data.resource_type === 'source';
  const headerStyle = isSource ? sourceHeaderStyle : modelHeaderStyle;

  // Combina o estilo base com o estilo de highlight se o nó estiver selecionado
  const dynamicNodeStyle = {
      ...nodeStyle,
      ...(selected ? nodeHighlightStyle : {}),
  };

  return (
    <div style={dynamicNodeStyle}>
      <div style={headerStyle}>
        <div style={iconStyle}>
            {isSource ? (
                // Ícone para Source (representando um banco de dados/cilindro)
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                </svg>
            ) : (
                // Ícone para Model (representando uma tabela)
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
            )}
        </div>
        <div>
            <div style={tableNameStyle}>{data.label}</div>
            <div style={dbSchemaStyle}>{data.database}.{data.schema}</div>
        </div>
      </div>
      <div style={columnContainerStyle}>
        {data.columns.map((column, index) => {
          const isSelected = data.selectedColumn === column.id;
          const dynamicColumnStyle = {
            ...columnBaseStyle,
            ...(index === data.columns.length - 1 ? { borderBottom: 'none' } : {}),
            backgroundColor: isSelected ? '#e6fffa' : 'transparent',
          };

          return (
            <div
              key={column.id}
              style={dynamicColumnStyle}
              onClick={() => data.onColumnClick(column.id)}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#e6fffa' : '#f9f9f9'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#e6fffa' : 'transparent'}
            >
              <Handle type="target" position={Position.Left} id={column.id} isConnectable={isConnectable} style={{ top: '50%', borderRadius: 0 }} />
              <span style={columnNameStyle}>{column.name}</span>
              <span style={columnTypeStyle}>{column.type}</span>
              <Handle type="source" position={Position.Right} id={column.id} isConnectable={isConnectable} style={{ top: '50%', borderRadius: 0 }} />
            </div>
          );
        })}
      </div>
      {data.tags && data.tags.length > 0 && (
        <div style={tagsFooterStyle}>
            {data.tags.map(tag => <span key={tag} style={tagStyle}>{tag}</span>)}
        </div>
      )}
    </div>
  );
});
