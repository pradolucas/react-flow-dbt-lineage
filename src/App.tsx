// src/App.tsx
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Node, Edge, NodeMouseHandler, EdgeMouseHandler } from 'reactflow';
import { useDbtData } from './hooks/useDbtData';
import { useGraphFilters } from './hooks/useGraphFilters';
import { Header } from './components/Header/Header';
import { Flow } from './components/Flow/Flow';
import { TableNodeData, TableData, ColumnData } from './types/dbt';
import { SearchSuggestion } from './components/Header/SearchBar';
import { MAX_COLUMNS_COLLAPSED } from './components/Node/TableNode';
import './App.css';

function App() {
  const { allNodes, allEdges, tableMap, availableTags, lineageDate, isLoading, error } = useDbtData();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setNodes,
    searchQuery,
    setSearchQuery,
    selectedTags,
    setSelectedTags,
    selectedColumns,
    setSelectedColumns,
    selectedTableConnection,
    setSelectedTableConnection,
    focusedColumnId,
    setFocusedColumnId,
    manuallyRevealedNodeIds,
    setManuallyRevealedNodeIds,
    suggestions,
    setSuggestions,
    clearFilters,
    clearSelections,
  } = useGraphFilters({ allNodes, allEdges, tableMap, isLoading, setExpandedNodes });

  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);

  const getNeighboringNodes = useCallback((nodeId: string): Set<string> => {
      const neighbors = new Set([nodeId]);
      const targetNode = allNodes.find((n) => n.id === nodeId);
      if (!targetNode) return neighbors;
      const allColumnIds = targetNode.data.columns.map((col: ColumnData) => col.id);
      allEdges.forEach((edge) => {
          if (
              allColumnIds.includes(edge.sourceHandle!) ||
              allColumnIds.includes(edge.targetHandle!)
          ) {
              neighbors.add(edge.source);
              neighbors.add(edge.target);
          }
      });
      return neighbors;
  }, [allNodes, allEdges]);

  const handleNodeClick: NodeMouseHandler = useCallback((event: React.MouseEvent, node: Node<TableNodeData>) => {
    const isDeselecting = selectedTableConnection === node.id && selectedColumns.length > 0;
    
    clearSelections();

    if (isDeselecting) {
      return;
    }
    
    setNodes((nds: Node<TableData>[]) => nds.map((n: Node<TableData>) => ({ ...n, selected: n.id === node.id })));
    setSelectedTableConnection(node.id);
    setSelectedColumns(node.data.columns.map((c: ColumnData) => c.id)); // This is the key fix
    const neighbors = getNeighboringNodes(node.id);
    setExpandedNodes(prev => new Set([...prev, ...neighbors]));
  }, [selectedTableConnection, selectedColumns, clearSelections, getNeighboringNodes, setNodes]);

  // This effect runs once when the data is loaded to handle URL params
  useEffect(() => {
    if (allNodes.length > 0 && !isLoading) {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get("search");
      if (searchParam) {
        const targetNode = allNodes.find(n => n.data.label.toLowerCase() === searchParam.toLowerCase());
        if (targetNode) {
          // Simulate a click on the node found from the URL
          handleNodeClick({} as React.MouseEvent, targetNode as Node<TableNodeData>);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes, isLoading]); // Depends on allNodes and isLoading

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    clearFilters();
    setSearchQuery(query);

    if (query) {
      const newSuggestions: SearchSuggestion[] = [];
      const addedTables = new Set<string>();
      allNodes.forEach((node: Node<TableData>) => {
        if (node.data.label.toLowerCase().includes(query.toLowerCase()) && !addedTables.has(node.data.label)) {
          newSuggestions.push({ type: 'table', label: node.data.label });
          addedTables.add(node.data.label);
        }
        node.data.columns.forEach((col: ColumnData) => {
          if (col.name.toLowerCase().includes(query.toLowerCase())) {
            newSuggestions.push({
              type: 'column',
              tableLabel: node.data.label,
              columnLabel: col.name,
              columnId: col.id,
            });
          }
        });
      });
      setSuggestions(newSuggestions);
    } else {
      setSuggestions([]);
    }
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    clearSelections();
    const tableLabel = suggestion.tableLabel || suggestion.label;
    const targetNode = allNodes.find((node) => node.data.label === tableLabel);

    if (targetNode) {
      const neighbors = getNeighboringNodes(targetNode.id);
      setExpandedNodes(prev => new Set([...prev, ...neighbors]));
      if (suggestion.type === 'table') {
        setSearchQuery(suggestion.label || '');
        handleNodeClick({} as React.MouseEvent, targetNode as Node<TableNodeData>);
      } else {
        setSearchQuery('');
        setFocusedColumnId(suggestion.columnId!);
        setSelectedColumns([suggestion.columnId!]);
      }
    }
    setSuggestions([]);
  };
  
  const handleTagSelectionChange = (tag: string) => {
    clearFilters();
    setSelectedTags((prevTags: string[]) => {
      const newTags = new Set(prevTags);
      if (newTags.has(tag)) newTags.delete(tag);
      else newTags.add(tag);
      return Array.from(newTags);
    });
  };

  const handleEdgeClick: EdgeMouseHandler = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (edge.id.startsWith("e-table-")) {
      const isDeselecting = selectedTableConnection === edge.id;
      clearSelections();
      if (!isDeselecting) {
        setSelectedTableConnection(edge.id);
      }
    }
  }, [selectedTableConnection, clearSelections]);

  const handlePaneClick = () => {
    clearSelections();
    setIsTagDropdownOpen(false);
  };
  
  const handleColumnClick = useCallback((columnId: string) => {
    const isDeselecting = selectedColumns.length === 1 && selectedColumns[0] === columnId;
    
    clearSelections();

    if (isDeselecting) {
      return;
    }
    
    setSelectedColumns([columnId]);

    const parentNode = allNodes.find(n => n.data.columns.some(c => c.id === columnId));
    const parentNodeId = parentNode ? parentNode.id : null;

    const nodesToExpand = new Set<string>();
    allEdges.forEach(edge => {
      if (edge.sourceHandle === columnId) {
        if (edge.target !== parentNodeId && !expandedNodes.has(edge.target)) {
            const targetNode = allNodes.find(n => n.id === edge.target);
            if (targetNode) {
              const targetColumnIndex = targetNode.data.columns.findIndex(c => c.id === edge.targetHandle);
              if (targetColumnIndex >= MAX_COLUMNS_COLLAPSED) {
                  nodesToExpand.add(edge.target);
              }
            }
        }
      }
      if (edge.targetHandle === columnId) {
        if (edge.source !== parentNodeId && !expandedNodes.has(edge.source)) {
            const sourceNode = allNodes.find(n => n.id === edge.source);
            if (sourceNode) {
              const sourceColumnIndex = sourceNode.data.columns.findIndex(c => c.id === edge.sourceHandle);
              if (sourceColumnIndex >= MAX_COLUMNS_COLLAPSED) {
                  nodesToExpand.add(edge.source);
              }
            }
        }
      }
    });

    if (nodesToExpand.size > 0) {
        setExpandedNodes(prev => new Set([...prev, ...nodesToExpand]));
    }
  }, [allNodes, allEdges, expandedNodes, selectedColumns, clearSelections]);
  
  const handleToggleNodeExpand = useCallback((nodeId: string) => {
      setExpandedNodes(prev => {
          const newSet = new Set(prev);
          if (newSet.has(nodeId)) {
              newSet.delete(nodeId);
          } else {
              const nodesToExpand = getNeighboringNodes(nodeId);
              nodesToExpand.forEach(id => newSet.add(id));
          }
          return newSet;
      });
  }, [getNeighboringNodes]);

  const handleRevealNeighbors = useCallback((nodeId: string) => {
    setFocusedColumnId(null);
    setManuallyRevealedNodeIds(prev => new Set([...prev, nodeId]));
  }, [setFocusedColumnId, setManuallyRevealedNodeIds]);
  
  const handleSearchFocus = () => {
    setIsTagDropdownOpen(false);
  };

  const handleToggleTagDropdown = () => {
    setIsTagDropdownOpen(prev => !prev);
  };
  
  const handleAppPaneClick = () => {
    handlePaneClick();
    setIsTagDropdownOpen(false);
  }

  const nodesWithClickHandlers = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onColumnClick: handleColumnClick,
        selectedColumns: selectedColumns,
        onToggleExpand: handleToggleNodeExpand,
        isExpanded: expandedNodes.has(node.id),
        onRevealNeighbors: handleRevealNeighbors,
        focusedColumnId: focusedColumnId,
      } as TableNodeData,
    }));
  }, [nodes, selectedColumns, handleToggleNodeExpand, expandedNodes, focusedColumnId, handleColumnClick, handleRevealNeighbors]);
  
  if (isLoading) {
    return <div className="loading-screen">Loading Data Lineage...</div>;
  }

  if (error) {
    return <div className="loading-screen">Error: {error.message}</div>;
  }

  return (
    <div className="app-container">
      <Header
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        suggestions={suggestions}
        onSuggestionClick={handleSuggestionClick}
        allNodes={allNodes}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onTagSelectionChange={handleTagSelectionChange}
        showClearButton={searchQuery !== '' || selectedTags.length > 0 || selectedColumns.length > 0 || manuallyRevealedNodeIds.size > 0}
        onClearFilters={clearFilters}
        lineageDate={lineageDate}
        isTagDropdownOpen={isTagDropdownOpen}
        onToggleTagDropdown={handleToggleTagDropdown}
        onSearchFocus={handleSearchFocus}
      />
      <Flow
        nodes={nodesWithClickHandlers}
        edges={edges as Edge[]}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handleAppPaneClick}
      />
    </div>
  );
}

export default App;