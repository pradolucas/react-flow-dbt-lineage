// src/hooks/useGraphFilters.ts
import { useState, useEffect, useCallback } from 'react';
import { useNodesState, useEdgesState, Edge, Node } from 'reactflow';
import { FlowEdge, TableMap, TableData, ColumnData } from '../types/index';

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

  useEffect(() => {
    if (allNodes.length > 0) {
      setNodes(allNodes);
    }
  }, [allNodes, setNodes]);

  useEffect(() => {
    if (allEdges.length > 0) {
      setEdges(allEdges);
    }
  }, [allEdges, setEdges]);


  useEffect(() => {
    if (isLoading || allNodes.length === 0) return;

    const isFiltering = focusedColumnId || searchQuery || selectedTags.length > 0 || manuallyRevealedNodeIds.size > 0;
    let visibleNodeIds = isFiltering ? new Set<string>() : new Set<string>(allNodes.map(n => n.id));
    const visibleColumnsByNode = new Map<string, Set<string>>();

    if (isFiltering) {
        let nodesToShowIds = new Set<string>();
        if (focusedColumnId) {
            allEdges.forEach((edge) => {
                if (edge.sourceHandle === focusedColumnId || edge.targetHandle === focusedColumnId) {
                  nodesToShowIds.add(edge.source);
                  nodesToShowIds.add(edge.target);
                }
            });
            if (nodesToShowIds.size === 0) {
                const parentNode = allNodes.find((node) => node.data.columns.some((col) => col.id === focusedColumnId));
                if (parentNode) nodesToShowIds.add(parentNode.id);
            }

            // **NEW**: Determine exactly which columns should be visible in each node
            const connectedColumnIds = new Set<string>([focusedColumnId]);
            allEdges.forEach(edge => {
                if (edge.sourceHandle === focusedColumnId && edge.targetHandle) connectedColumnIds.add(edge.targetHandle);
                if (edge.targetHandle === focusedColumnId && edge.sourceHandle) connectedColumnIds.add(edge.sourceHandle);
            });
            nodesToShowIds.forEach(nodeId => {
                const nodeData = tableMap[nodeId];
                const columnsForNode = new Set<string>();
                nodeData?.columns.forEach(col => {
                    if (connectedColumnIds.has(col.id)) columnsForNode.add(col.id);
                });
                if (columnsForNode.size > 0) visibleColumnsByNode.set(nodeId, columnsForNode);
            });

        } else {
            const baseNodes = new Set<string>();
            if (searchQuery) {
                const matchingNodes = allNodes.filter((node) => node.data.label.toLowerCase() === searchQuery.toLowerCase() || node.data.columns.some((col) => col.name.toLowerCase().includes(searchQuery.toLowerCase())));
                matchingNodes.forEach((n) => baseNodes.add(n.id));
            } else if (selectedTags.length > 0) {
                const tagNodes = allNodes.filter((n) => selectedTags.some((tag) => n.data.tags?.includes(tag)));
                tagNodes.forEach((n) => baseNodes.add(n.id));
            }
            manuallyRevealedNodeIds.forEach((id) => baseNodes.add(id));
            nodesToShowIds = new Set(baseNodes);
            baseNodes.forEach((nodeId) => {
                allEdges.forEach((edge) => {
                  if (edge.source === nodeId) nodesToShowIds.add(edge.target);
                  if (edge.target === nodeId) nodesToShowIds.add(edge.source);
                });
            });
        }
        visibleNodeIds = nodesToShowIds;
    }
    
    setNodes(prevNodes =>
        prevNodes.map(node => {
            const isVisible = visibleNodeIds.has(node.id);
            // **NEW**: Pass the set of visible column IDs down to the node data
            const visibleColumnIdsForNode = focusedColumnId ? visibleColumnsByNode.get(node.id) : undefined;
            return {
                ...node,
                hidden: !isVisible,
                selected: node.id === selectedTableConnection,
                data: {
                  ...node.data,
                  visibleColumnIds: visibleColumnIdsForNode,
                }
            };
        })
    );

    setEdges(prevEdges => prevEdges.map((edge) => {
        const isVisible = visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);
        const isTableEdge = edge.id.startsWith("e-table-");
        const isColumnEdge = !!(edge.sourceHandle && edge.targetHandle && !isTableEdge);

        const isColumnHighlighted = isColumnEdge && (selectedColumns.includes(edge.sourceHandle!) || selectedColumns.includes(edge.targetHandle!));
        const isTableHighlighted = isTableEdge && (selectedTableConnection === edge.source || selectedTableConnection === edge.target);

        let style: React.CSSProperties = {};
        if (isTableEdge) style = { stroke: "#adb5bd", strokeWidth: 2, strokeDasharray: "5 5" };
        else style = { stroke: "#b1b1b7", strokeWidth: 1.5 };

        let animated = false;
        let zIndex = -1;

        if (isColumnHighlighted) {
            style.stroke = '#00A4C9';
            style.strokeWidth = 2.5;
            style.strokeDasharray = undefined;
            animated = true;
            zIndex = 1000;
        } else if (isTableHighlighted) {
            style.stroke = '#9d4edd';
            style.strokeWidth = 2.5;
            style.strokeDasharray = undefined;
            zIndex = 1000;
        }
        
        return { ...edge, hidden: !isVisible, animated: animated, style: style, zIndex: zIndex };
    }));

  }, [
    isLoading,
    allNodes,
    allEdges,
    tableMap,
    searchQuery, 
    selectedTags, 
    manuallyRevealedNodeIds, 
    focusedColumnId, 
    selectedTableConnection, 
    selectedColumns,
    setNodes,
    setEdges,
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