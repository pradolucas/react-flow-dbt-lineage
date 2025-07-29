// src/hooks/useGraphFilters.ts
import { useState, useEffect, useCallback } from 'react';
import { useNodesState, useEdgesState, Edge, Node } from 'reactflow';
import { FlowEdge, TableMap, TableData } from '../types/index';
import { calculateDynamicLayout } from '../services/layoutService';

interface GraphFilterProps {
  allNodes: Node<TableData>[];
  allEdges: FlowEdge[];
  tableMap: TableMap;
  isLoading: boolean;
  setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  layoutTrigger: number; // New prop to trigger layout recalculation
}

export function useGraphFilters({ allNodes, allEdges, tableMap, isLoading, setExpandedNodes, layoutTrigger }: GraphFilterProps) {
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
    if (allNodes.length > 0) setNodes(allNodes);
  }, [allNodes, setNodes]);

  useEffect(() => {
    if (allEdges.length > 0) setEdges(allEdges);
  }, [allEdges, setEdges]);

  const getVisibleSubset = useCallback(() => {
    const isFiltering = focusedColumnId || searchQuery || selectedTags.length > 0 || manuallyRevealedNodeIds.size > 0;
    if (!isFiltering) {
        const allNodeIds = new Set(allNodes.map(n => n.id));
        return { visibleNodes: allNodes, visibleEdges: allEdges, visibleNodeIds: allNodeIds };
    }

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
    const visibleNodes = allNodes.filter(n => nodesToShowIds.has(n.id));
    const visibleEdges = allEdges.filter(e => nodesToShowIds.has(e.source) && nodesToShowIds.has(e.target));
    return { visibleNodes, visibleEdges, visibleNodeIds: nodesToShowIds };
  }, [allNodes, allEdges, focusedColumnId, searchQuery, selectedTags, manuallyRevealedNodeIds]);

  // Effect for visibility and styling
  useEffect(() => {
    if (isLoading || allNodes.length === 0) return;
    
    const { visibleNodeIds } = getVisibleSubset();
    const visibleColumnsByNode = new Map<string, Set<string>>();

    if (focusedColumnId) {
        const connectedColumnIds = new Set<string>([focusedColumnId]);
        allEdges.forEach(edge => {
            if (edge.sourceHandle === focusedColumnId && edge.targetHandle) connectedColumnIds.add(edge.targetHandle);
            if (edge.targetHandle === focusedColumnId && edge.sourceHandle) connectedColumnIds.add(edge.sourceHandle);
        });
        visibleNodeIds.forEach(nodeId => {
            const nodeData = tableMap[nodeId];
            const columnsForNode = new Set<string>();
            nodeData?.columns.forEach(col => {
                if (connectedColumnIds.has(col.id)) columnsForNode.add(col.id);
            });
            if (columnsForNode.size > 0) visibleColumnsByNode.set(nodeId, columnsForNode);
        });
    }

    setNodes(prevNodes =>
        prevNodes.map(node => ({
            ...node,
            hidden: !visibleNodeIds.has(node.id),
            selected: node.id === selectedTableConnection,
            data: { ...node.data, visibleColumnIds: visibleColumnsByNode.get(node.id) }
        }))
    );

    setEdges(prevEdges => prevEdges.map((edge) => {
        const isVisible = visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);
        const isTableEdge = edge.id.startsWith("e-table-");
        const isColumnEdge = !!(edge.sourceHandle && edge.targetHandle && !isTableEdge);
        const isColumnHighlighted = isColumnEdge && (selectedColumns.includes(edge.sourceHandle!) || selectedColumns.includes(edge.targetHandle!));
        const isTableHighlighted = isTableEdge && (selectedTableConnection === edge.source || selectedTableConnection === edge.target);

        let style: React.CSSProperties = isTableEdge ? { stroke: "#adb5bd", strokeWidth: 2, strokeDasharray: "5 5" } : { stroke: "#b1b1b7", strokeWidth: 1.5 };
        let animated = false;
        let zIndex = -1;

        if (isColumnHighlighted) {
            style.stroke = '#00A4C9'; style.strokeWidth = 2.5; style.strokeDasharray = undefined; animated = true; zIndex = 1000;
        } else if (isTableHighlighted) {
            style.stroke = '#9d4edd'; style.strokeWidth = 2.5; style.strokeDasharray = undefined; zIndex = 1000;
        }
        
        return { ...edge, hidden: !isVisible, animated, style, zIndex };
    }));

  }, [isLoading, allNodes, allEdges, tableMap, getVisibleSubset, focusedColumnId, selectedTableConnection, selectedColumns, setNodes, setEdges]);
  
  // **NEW**: Effect for recalculating layout
  useEffect(() => {
    if (layoutTrigger === 0 || isLoading) return;

    const { visibleNodes, visibleEdges } = getVisibleSubset();

    if (visibleNodes.length === 0) return;

    const nodesDataObject = visibleNodes.reduce((acc, node) => {
        acc[node.id] = tableMap[node.id];
        return acc;
    }, {} as TableMap);

    const nodesWithNewLayout = calculateDynamicLayout(nodesDataObject, visibleEdges);
    const newPositions = new Map(nodesWithNewLayout.map(n => [n.id, n.position]));

    setNodes(currentNodes => currentNodes.map(node => {
        if (newPositions.has(node.id)) {
            return { ...node, position: newPositions.get(node.id)! };
        }
        return node;
    }));
  }, [layoutTrigger, isLoading, getVisibleSubset, tableMap, setNodes]);

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