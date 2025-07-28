// src/utils/graphUtils.ts
import { Node, Edge } from 'reactflow';
import { ColumnData, TableData } from '../types';

export const getNeighboringNodes = (
  nodeId: string,
  allNodes: Node<TableData>[],
  allEdges: Edge[],
): Set<string> => {
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
};