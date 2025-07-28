// src/hooks/useGraphFilters.ts
import { useState, useEffect, useCallback, useRef } from 'react'; // Import useRef
import { useNodesState, useEdgesState, Edge, Node } from 'reactflow';
import { FlowEdge, TableMap, TableData, ColumnData } from '../types/dbt';
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
  
  const isInitialLoad = useRef(true); // Add a ref to track the initial load

  // Write to URL when filters change
  useEffect(() => {
    // If the data is loading, do nothing.
    if (isLoading) return;
    
    // If it's the first time this effect runs after data has loaded,
    // set the ref to false and skip writing to the URL.
    // This allows the App.tsx effect to read the initial URL params first.
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (focusedColumnId) {
      params.set("column", focusedColumnId);
    } else if (searchQuery) {
      params.set("search", searchQuery);
    } else if (selectedTags.length > 0) {
      params.set("tags", selectedTags.join(","));
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({ path: newUrl }, "", newUrl);
  }, [focusedColumnId, searchQuery, selectedTags, isLoading]);


  const clearSelections = useCallback(() => {
    setSelectedColumns([]);
    setSelectedTableConnection(null);
    setFocusedColumnId(null);
    setNodes((nds) => nds.map(n => ({ ...n, selected: false })));
  }, [setNodes]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedTags([]);
    setSuggestions([]);
    setManuallyRevealedNodeIds(new Set());
    setExpandedNodes(new Set());
    clearSelections();
  }, [clearSelections, setExpandedNodes]);

  // Main filtering logic... (remains unchanged)
  useEffect(() => {
    if (allNodes.length === 0) return;
    let nodesToShowIds = new Set<string>();
    if (focusedColumnId) {
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
    } else {
      const baseNodes = new Set<string>();
      const primaryFilterIsActive = searchQuery || selectedTags.length > 0;
      if (primaryFilterIsActive) {
        if (searchQuery) {
          const matchingNodes = allNodes.filter((node) => node.data.label.toLowerCase() === searchQuery.toLowerCase() || node.data.columns.some((col: ColumnData) => col.name.toLowerCase().includes(searchQuery.toLowerCase())));
          matchingNodes.forEach((n) => baseNodes.add(n.id));
        } else {
          const tagNodes = allNodes.filter((n) => selectedTags.some((tag) => n.data.tags?.includes(tag)));
          tagNodes.forEach((n) => baseNodes.add(n.id));
        }
      }
      manuallyRevealedNodeIds.forEach((id) => baseNodes.add(id));
      if (baseNodes.size === 0 && (primaryFilterIsActive || manuallyRevealedNodeIds.size > 0)) {
         setNodes([]);
         setEdges([]);
         return;
      }
      if (baseNodes.size === 0) {
        setNodes(allNodes);
        setEdges(allEdges);
        return;
      }
      nodesToShowIds = new Set(baseNodes);
      baseNodes.forEach((nodeId) => {
        allEdges.forEach((edge) => {
          if (edge.source === nodeId) nodesToShowIds.add(edge.target);
          if (edge.target === nodeId) nodesToShowIds.add(edge.source);
        });
      });
    }
    const filteredNodes = allNodes.filter((n) => nodesToShowIds.has(n.id));
    const filteredEdges = allEdges.filter((e) => nodesToShowIds.has(e.source) && nodesToShowIds.has(e.target));
    const nodesDataObject = filteredNodes.reduce((acc, node) => {
      acc[node.id] = tableMap[node.id];
      return acc;
    }, {} as TableMap);
    const relayoutedNodes = calculateDynamicLayout(nodesDataObject, filteredEdges);
    setNodes(relayoutedNodes);
    setEdges(filteredEdges);
  }, [searchQuery, selectedTags, manuallyRevealedNodeIds, allNodes, allEdges, focusedColumnId, tableMap, setNodes, setEdges]);
  
  // Rewritten Edge Highlighting Logic
  useEffect(() => {
    setEdges((currentEdges) =>
      currentEdges.map((edge): Edge => {
        const isTableEdge = edge.id.startsWith("e-table-");
        const isColumnEdge = !!(edge.sourceHandle && edge.targetHandle && !isTableEdge);

        const isColumnHighlighted = isColumnEdge && (selectedColumns.includes(edge.sourceHandle!) || selectedColumns.includes(edge.targetHandle!));
        const isTableHighlighted = isTableEdge && (selectedTableConnection === edge.id || selectedTableConnection === edge.source || selectedTableConnection === edge.target);

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
      })
    );
  }, [selectedColumns, selectedTableConnection, setEdges]);

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setNodes,
    setEdges,
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