// src/services/layoutService.ts
import { Node } from 'reactflow';
import { TableMap, TableData, FlowEdge } from '../types';

const HORIZONTAL_SPACING = 480;
const VERTICAL_SPACING = 400;

/**
 * Calculates the layout of nodes in a hierarchical manner based on dependencies.
 * This is a simple topological sort and layering approach.
 */
export function calculateDynamicLayout(nodesData: TableMap, edgesData: FlowEdge[]): Node<TableData>[] {
  const nodeDepths = new Map<string, number>();
  const allNodeIds = Object.keys(nodesData);

  // Helper function to recursively calculate the depth of a node
  function getDepth(nodeId: string): number {
    if (nodeDepths.has(nodeId)) return nodeDepths.get(nodeId)!;
    
    // Source nodes are at depth 0
    if (nodeId.startsWith("source.")) {
      nodeDepths.set(nodeId, 0);
      return 0;
    }

    const parents = edgesData
      .filter((e) => e.target === nodeId)
      .map((e) => e.source);

    // Nodes with no parents are at depth 0
    if (parents.length === 0) {
      nodeDepths.set(nodeId, 0);
      return 0;
    }

    const maxParentDepth = Math.max(...parents.map((p) => getDepth(p)));
    const depth = maxParentDepth + 1;
    nodeDepths.set(nodeId, depth);
    return depth;
  }

  // Calculate depth for all nodes
  allNodeIds.forEach((nodeId) => getDepth(nodeId));

  // Group nodes by their calculated depth (layer)
  const layers = new Map<number, string[]>();
  nodeDepths.forEach((depth, nodeId) => {
    if (!layers.has(depth)) layers.set(depth, []);
    layers.get(depth)!.push(nodeId);
  });

  const positionedNodes: Node<TableData>[] = [];
  Array.from(layers.keys())
    .sort((a, b) => a - b)
    .forEach((depth) => {
      const layerNodes = layers.get(depth)!;
      const layerHeight = (layerNodes.length - 1) * VERTICAL_SPACING;
      const startY = -layerHeight / 2;
      
      layerNodes.forEach((nodeId, index) => {
        positionedNodes.push({
          id: nodeId,
          type: "tableNode",
          position: {
            x: depth * HORIZONTAL_SPACING,
            y: startY + index * VERTICAL_SPACING,
          },
          data: nodesData[nodeId], // This is now correctly typed
        });
      });
    });

  return positionedNodes;
}
