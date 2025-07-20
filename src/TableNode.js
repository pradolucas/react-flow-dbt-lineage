// src/TableNode.js
import React, { memo, useState } from 'react'; // Added useState
import { Handle, Position } from 'reactflow';

// --- STYLES ---
const nodeStyle = {
  border: '1px solid #ddd',
  borderRadius: '8px',
  backgroundColor: '#fefefe',
  width: 260,
  fontFamily: "'Inter', sans-serif",
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

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
  overflow: 'hidden', // Garante que o conteúdo do cabeçalho não transborde
};

const modelHeaderStyle = { ...headerBaseStyle, backgroundColor: '#2d3748' };
const sourceHeaderStyle = { ...headerBaseStyle, backgroundColor: '#2f855a' };

const iconStyle = {
    marginRight: '10px',
    flexShrink: 0,
};

// Estilos para truncar texto
const truncateTextStyle = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

const tableNameStyle = {
    fontSize: '16px',
    fontWeight: '600',
    ...truncateTextStyle, // Aplica o estilo de truncar
};
const dbSchemaStyle = {
    fontSize: '12px',
    opacity: '0.7',
    marginTop: '2px',
    ...truncateTextStyle, // Aplica o estilo de truncar
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

const columnNameStyle = {
    fontWeight: '500',
    fontSize: '14px',
    maxWidth: '180px', // Aumentado para dar mais espaço, já que o ícone é menor
    ...truncateTextStyle,
};
// Removido o columnTypeStyle, pois será substituído pelo ícone

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

// Updated style for the expand/collapse button
const expanderStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '6px', // Space between text and icon
    padding: '8px 0',
    cursor: 'pointer',
    color: '#718096',
    backgroundColor: '#f7fafc',
    borderBottom: '1px solid #eee',
    transition: 'background-color 0.2s',
};

const expanderTextStyle = {
    fontSize: '12px',
    fontWeight: '500',
};

// --- NOVO COMPONENTE DE ÍCONE (Refatorado) ---

// Mapeamento de palavras-chave para ícones SVG
const dataTypeIconMap = {
    numeric: {
        keywords: ['int', 'numeric', 'decimal', 'serial', 'double', 'real', 'money'],
        icon: <svg title="Numeric" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>
    },
    text: {
        keywords: ['char', 'text'],
        icon: <svg title="Text" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
    },
    datetime: {
        keywords: ['date', 'time', 'interval'],
        icon: <svg title="Date/Time" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
    },
    boolean: {
        keywords: ['bool'],
        icon: <svg title="Boolean" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    },
    json: {
        keywords: ['json'],
        icon: <svg title="JSON" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4a2 2 0 0 0 -2 2v3a2 3 0 0 1 -2 3a2 3 0 0 1 2 3v3a2 2 0 0 0 2 2" /><path d="M17 4a2 2 0 0 1 2 2v3a2 3 0 0 0 2 3a2 3 0 0 0 -2 3v3a2 2 0 0 1 -2 2" /></svg>
    },
    array: {
        keywords: ['[]'],
        icon: <svg title="Array" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="2" ry="2"></rect><path d="M17 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2"></path></svg>
    },
    uuid: {
        keywords: ['uuid'],
        icon: <svg title="UUID" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h3m14 0h3M12 2v3m0 14v3"/><circle cx="12" cy="12" r="7"/></svg>
    },
    binary: {
        keywords: ['bytea'],
        icon: <svg title="Binary" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10v4"/><path d="M10.5 10h1.5c.8 0 1.5.7 1.5 1.5v1c0 .8-.7 1.5-1.5 1.5h-1.5"/><path d="M16 14v-4h2"/><path d="M18 10v4"/></svg>
    },
    network: {
        keywords: ['cidr', 'inet', 'macaddr'],
        icon: <svg title="Network" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
    },
    geometric: {
        keywords: ['point', 'line', 'lseg', 'box', 'path', 'polygon', 'circle'],
        icon: <svg title="Geometric" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"></circle><path d="M12 22V8"></path><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path></svg>
    },
    default: {
        keywords: [],
        icon: <svg title="Unknown" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
    }
};

const DataTypeIcon = ({ type }) => {
    const typeLower = type.toLowerCase();
    
    // Encontra o primeiro ícone cujas palavras-chave correspondem ao tipo de dado.
    const foundIcon = Object.values(dataTypeIconMap).find(iconData => 
        iconData.keywords.some(keyword => typeLower.includes(keyword))
    );

    // Se encontrar um ícone, usa-o. Caso contrário, usa o ícone padrão.
    const icon = foundIcon ? foundIcon.icon : dataTypeIconMap.default.icon;

    return <div title={type}>{icon}</div>;
};


// --- COMPONENTE PRINCIPAL ---
export default memo(({ data, isConnectable, selected }) => {
  // State to control if the column list is expanded
  const [isExpanded, setIsExpanded] = useState(false);
  const MAX_COLUMNS_COLLAPSED = 5; // Maximum number of columns to display when collapsed

  const isSource = data.resource_type === 'source';
  const headerStyle = isSource ? sourceHeaderStyle : modelHeaderStyle;

  const dynamicNodeStyle = {
      ...nodeStyle,
      ...(selected ? nodeHighlightStyle : {}),
  };

  // Logic to determine which columns to display
  const hasManyColumns = data.columns.length > MAX_COLUMNS_COLLAPSED;
  const columnsToShow = hasManyColumns && !isExpanded
      ? data.columns.slice(0, MAX_COLUMNS_COLLAPSED)
      : data.columns;

  return (
    <div style={dynamicNodeStyle}>
      <div style={headerStyle} title={`${data.database}.${data.schema}.${data.label}`}>
        <div style={iconStyle}>
            {isSource ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
            )}
        </div>
        <div style={{overflow: 'hidden'}}>
            <div style={tableNameStyle} title={data.label}>{data.label}</div>
            <div style={dbSchemaStyle} title={`${data.database}.${data.schema}`}>{data.database}.{data.schema}</div>
        </div>
      </div>
      <div style={columnContainerStyle}>
        {columnsToShow.map((column, index) => {
          const isSelected = data.selectedColumn === column.id;
          const dynamicColumnStyle = {
            ...columnBaseStyle,
            // Removes the bottom border from the last visible item
            ...(index === columnsToShow.length - 1 ? { borderBottom: 'none' } : {}),
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
              <span style={columnNameStyle} title={column.name}>{column.name}</span>
              <DataTypeIcon type={column.type} />
              <Handle type="source" position={Position.Right} id={column.id} isConnectable={isConnectable} style={{ top: '50%', borderRadius: 0 }} />
            </div>
          );
        })}
      </div>
      
      {/* Renders the expand/collapse button with icons and text */}
      {hasManyColumns && (
        <div
            style={expanderStyle}
            onClick={() => setIsExpanded(!isExpanded)}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#edf2f7'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f7fafc'}
            title={isExpanded ? 'Hide columns' : 'Show more columns'}
        >
          {isExpanded ? (
            <>
              <span style={expanderTextStyle}>Hide</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </>
          ) : (
            <>
              <span style={expanderTextStyle}>{`Show ${data.columns.length - MAX_COLUMNS_COLLAPSED} more`}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </>
          )}
        </div>
      )}

      {data.tags && data.tags.length > 0 && (
        <div style={tagsFooterStyle}>
            {data.tags.map(tag => <span key={tag} style={tagStyle}>{tag}</span>)}
        </div>
      )}
    </div>
  );
});
