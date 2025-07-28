// src/components/Flow/Flow.tsx
import React from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  NodeMouseHandler,
  EdgeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import TableNode from '../Node/TableNode';
import { TableNodeData } from '../../types';

const nodeTypes = { tableNode: TableNode };

interface FlowProps {
  nodes: Node<TableNodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onNodeClick: NodeMouseHandler;
  onEdgeClick: EdgeMouseHandler;
  onPaneClick: () => void;
}

export const Flow: React.FC<FlowProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
}) => {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      fitView
      panOnScroll
      nodesConnectable={false}
    >
      <Background />
      <Controls />
      <MiniMap
        pannable={true}
        zoomable={true}
        inversePan={true}
        zoomStep={5}
        nodeColor={(node) => {
          if (node.data.resource_type === 'source') return '#2f855a';
          return '#2d3748';
        }}
        nodeStrokeWidth={3}
        maskColor="rgba(233, 236, 239, 0.8)"
        style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
        }}
      />
    </ReactFlow>
  );
};