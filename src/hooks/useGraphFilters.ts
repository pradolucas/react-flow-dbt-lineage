// src/hooks/useGraphFilters.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNodesState, useEdgesState, Edge, Node } from 'reactflow';
import { FlowEdge, TableMap, TableData, ColumnData } from '../types/index'; // Corrected import path
import { calculateDynamicLayout } from '../services/layoutService';

interface GraphFilterProps {
  allNodes: Node<TableData>[];
  allEdges: FlowEdge[];
  tableMap: TableMap;
  isLoading: boolean;
  setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useGraphFilters({ allNodes, allEdges, tableMap, isLoading, setExpandedNodes }: GraphFilterProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TableData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [selectedTableConnection, setSelectedTableConnection] = useState<string | null>(null);
  const [focusedColumnId, setFocusedColumnId] = useState<string | null>(null);
  const [manuallyRevealedNodeIds, setManuallyRevealedNodeIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<any[]>([]);
  
  const isInitialLoad = useRef(true);
  
  const clearSelections = useCallback(() => {
    setSelectedColumns([]);
    setSelectedTableConnection(null);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedTags([]);
    setSuggestions([]);
    setManuallyRevealedNodeIds(new Set());
    setExpandedNodes(new Set());
    setFocusedColumnId(null); 
    clearSelections();
  }, [clearSelections, setExpandedNodes]);

  // Main filtering and highlighting logic
  useEffect(() => {
    if (isLoading || allNodes.length === 0) return;
    let nodesToShowIds = new Set<string>();
    let isFiltering = false;

    // Priority 1: A column is focused
    if (focusedColumnId) {
      isFiltering = true;
      allEdges.forEach((edge) => {
        if (edge.sourceHandle === focusedColumnId || edge.targetHandle === focusedColumnId) {
          nodesToShowIds.add(edge.source);
          nodesToShowIds.add(edge.target);
        }
      });
      if (nodesToShowIds.size === 0) {
        const parentNode = allNodes.find((node) => node.data.columns.some((col: ColumnData) => col.id === focusedColumnId));
        if (parentNode) nodesToShowIds.add(parentNode.id);
      }
    } 
    // Priority 2: Search, tags, or manual reveals are active
    else {
      const baseNodes = new Set<string>();
      const primaryFilterIsActive = searchQuery || selectedTags.length > 0;
      if (primaryFilterIsActive) {
        isFiltering = true;
        if (searchQuery) {
          const matchingNodes = allNodes.filter((node) => node.data.label.toLowerCase() === searchQuery.toLowerCase() || node.data.columns.some((col: ColumnData) => col.name.toLowerCase().includes(searchQuery.toLowerCase())));
          matchingNodes.forEach((n) => baseNodes.add(n.id));
        } else {
          const tagNodes = allNodes.filter((n) => selectedTags.some((tag) => n.data.tags?.includes(tag)));
          tagNodes.forEach((n) => baseNodes.add(n.id));
        }
      }
      if (manuallyRevealedNodeIds.size > 0) {
        isFiltering = true;
        manuallyRevealedNodeIds.forEach((id) => baseNodes.add(id));
      }

      if (baseNodes.size === 0 && isFiltering) {
         setNodes([]);
         setEdges([]);
         return;
      }
      
      if (isFiltering) {
        nodesToShowIds = new Set(baseNodes);
        baseNodes.forEach((nodeId) => {
            allEdges.forEach((edge) => {
            if (edge.source === nodeId) nodesToShowIds.add(edge.target);
            if (edge.target === nodeId) nodesToShowIds.add(edge.source);
            });
        });
      }
    }

    const finalNodes = isFiltering ? allNodes.filter((n) => nodesToShowIds.has(n.id)) : allNodes;
    let finalEdges = isFiltering ? allEdges.filter((e) => nodesToShowIds.has(e.source) && nodesToShowIds.has(e.target)) : allEdges;
    
    // Apply highlighting styles to the final set of edges
    finalEdges = finalEdges.map((edge): Edge => {
        const isTableEdge = edge.id.startsWith("e-table-");
        const isColumnEdge = !!(edge.sourceHandle && edge.targetHandle && !isTableEdge);

        const isColumnHighlighted = isColumnEdge && (selectedColumns.includes(edge.sourceHandle!) || selectedColumns.includes(edge.targetHandle!));
        const isTableHighlighted = isTableEdge && (selectedTableConnection === edge.source || selectedTableConnection === edge.target);

        const defaultStyle = {
          stroke: isTableEdge ? "#adb5bd" : "#b1b1b7",
          strokeWidth: isTableEdge ? 2 : 1.5,
          strokeDasharray: isTableEdge ? "5 5" : undefined,
        };

        const style = { ...defaultStyle };
        if (isColumnHighlighted) {
            style.stroke = '#00A4C9';
            style.strokeWidth = 2.5;
            style.strokeDasharray = undefined;
        } else if (isTableHighlighted) {
            style.stroke = '#9d4edd';
            style.strokeWidth = 2.5;
            style.strokeDasharray = undefined;
        }
        
        return {
          ...edge,
          animated: !!isColumnHighlighted,
          style: style,
          zIndex: (isColumnHighlighted || isTableHighlighted) ? 1000 : -1,
        };
    });

    const nodesDataObject = finalNodes.reduce((acc, node) => {
      acc[node.id] = tableMap[node.id];
      return acc;
    }, {} as TableMap);

    let relayoutedNodes = calculateDynamicLayout(nodesDataObject, finalEdges);

    relayoutedNodes = relayoutedNodes.map(node => ({
      ...node,
      selected: node.id === selectedTableConnection,
    }));

    setNodes(relayoutedNodes);
    setEdges(finalEdges);

  }, [
    searchQuery, 
    selectedTags, 
    manuallyRevealedNodeIds, 
    allNodes, 
    allEdges, 
    focusedColumnId, 
    tableMap, 
    setNodes,
    setEdges, 
    selectedTableConnection, 
    isLoading,
    selectedColumns
  ]);
  
  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
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
  };
}