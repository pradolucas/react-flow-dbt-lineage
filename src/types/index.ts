// src/types/index.ts

import { Node, Edge } from 'reactflow';

// A helper type for columns to avoid repetition
export interface ColumnData {
  id: string;
  name: string;
  description: string;
  type: string;
}

// Raw types from JSON files
export interface ManifestNode {
  resource_type: 'model' | 'source' | 'test' | 'exposure' | 'metric';
  unique_id: string;
  name: string;
  database: string;
  schema: string;
  columns: Record<string, { name: string; description: string }>;
  tags: string[];
  depends_on?: {
    nodes: string[];
  };
}

export interface CatalogNode {
  metadata: {
    type: string;
    database: string;
    schema: string;
    name: string;
  };
  columns: Record<string, { type: string; index: number; name: string; comment: string | null }>;
}

export interface LineageColumnRef {
  lineage: string[];
}

export interface LineageNode {
  [columnName: string]: {
    lineage: string[]; // e.g., ["source.jaffle_shop.raw_customers.id"]
  };
}

export interface LineageData {
  nodes: Record<string, {
    depends_on?: { nodes: string[] };
    columns: Record<string, LineageColumnRef>;
  }>;
  date_parsed: string;
}

// Processed data types

// Base data for a table, parsed from the JSON files
export interface TableData {
  id: string;
  label: string;
  resource_type: 'model' | 'source';
  database: string;
  schema: string;
  columns: ColumnData[];
  tags: string[];
  dbtDocsUrl: string;
}

// Enriched data for a node rendered on the canvas, including callbacks
export interface TableNodeData extends TableData {
  selectedColumns: string[];
  focusedColumnId?: string | null;
  isExpanded: boolean;
  onColumnClick: (columnId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onRevealNeighbors: (nodeId: string) => void;
  visibleColumnIds?: Set<string>; // New property
}

export type TableMap = Record<string, TableData>;

// React Flow types
export type FlowNode = Node<TableNodeData>;
export type FlowEdge = Edge;