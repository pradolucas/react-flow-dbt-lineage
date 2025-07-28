// src/services/dbtParsingService.ts
import { MarkerType } from 'reactflow';
import { ManifestNode, CatalogNode, LineageData, TableMap, FlowEdge } from '../types';

/**
 * Parses nodes from dbt's manifest and catalog files into a unified table map.
 */
export function parseDbtNodes(
  manifestData: { nodes?: Record<string, ManifestNode>, sources?: Record<string, ManifestNode> },
  catalogData: { nodes?: Record<string, CatalogNode>, sources?: Record<string, CatalogNode> }
): TableMap {
  const tables: TableMap = {};
  const allManifestNodes = { ...(manifestData.nodes || {}), ...(manifestData.sources || {}) };
  const allCatalogNodes = { ...(catalogData.nodes || {}), ...(catalogData.sources || {}) };

  for (const nodeId in allManifestNodes) {
    const node = allManifestNodes[nodeId];
    if (node.resource_type !== "model" && node.resource_type !== "source") continue;
    
    const catalogNode = allCatalogNodes[nodeId];
    if (!catalogNode) continue;

    let columnNames = Object.keys(node.columns || {});
    if (columnNames.length === 0 && catalogNode) {
      columnNames = Object.keys(catalogNode.columns || {});
    }

    const columns = columnNames.map((colName) => {
      const manifestCol = node.columns?.[colName] || {};
      const catalogCol = catalogNode.columns?.[colName] || {};
      return {
        id: `${node.name}-${colName}`,
        name: colName,
        description: manifestCol.description || "",
        type: catalogCol.type || "UNKNOWN",
      };
    });

    tables[nodeId] = {
      id: nodeId,
      label: node.name,
      resource_type: node.resource_type,
      database: node.database,
      schema: node.schema,
      columns: columns,
      tags: node.tags || [],
      dbtDocsUrl: `https://your-dbt-server.com/#!/${node.resource_type}/${nodeId}`, // Replace with your actual dbt docs URL
    };
  }
  return tables;
}

/**
 * Parses column-level lineage from lineage.json into React Flow edges.
 */
export function parseSqlLineageEdges(lineageData: LineageData, tableData: TableMap): FlowEdge[] {
  const edges = new Map<string, FlowEdge>();
  for (const targetModelId in lineageData.nodes) {
    const modelInfo = lineageData.nodes[targetModelId];
    if (!modelInfo.columns) continue;

    for (const targetColumnName in modelInfo.columns) {
      const lineageInfo = modelInfo.columns[targetColumnName];
      lineageInfo.lineage.forEach((sourceString) => {
        const parts = sourceString.split(".");
        const sourceColumnName = parts.pop();
        const sourceModelId = parts.join(".");
        
        const sourceNode = tableData[sourceModelId];
        const targetNode = tableData[targetModelId];
        if (!sourceNode || !targetNode || !sourceColumnName) return;

        const sourceHandle = `${sourceNode.label}-${sourceColumnName}`;
        const targetHandle = `${targetNode.label}-${targetColumnName}`;
        const edgeId = `e-${sourceHandle}-to-${targetHandle}`;

        if (!edges.has(edgeId)) {
          edges.set(edgeId, {
            id: edgeId,
            source: sourceModelId,
            target: targetModelId,
            sourceHandle: sourceHandle,
            targetHandle: targetHandle,
            animated: false,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#b1b1b7", strokeWidth: 1.5 },
          });
        }
      });
    }
  }
  return Array.from(edges.values());
}

/**
 * Parses table-level dependencies from lineage.json into React Flow edges.
 */
export function parseTableLevelEdges(lineageData: LineageData): FlowEdge[] {
  const edges: FlowEdge[] = [];
  for (const targetModelId in lineageData.nodes) {
    const nodeInfo = lineageData.nodes[targetModelId];
    if (nodeInfo.depends_on?.nodes) {
      nodeInfo.depends_on.nodes.forEach((sourceModelId) => {
        const edgeId = `e-table-${sourceModelId}-to-${targetModelId}`;
        edges.push({
          id: edgeId,
          source: sourceModelId,
          target: targetModelId,
          sourceHandle: "table-dependency-source",
          targetHandle: "table-dependency-target",
          type: "default",
          style: {
            stroke: "#adb5bd",
            strokeWidth: 2,
            strokeDasharray: "5 5",
          },
          zIndex: -1,
        });
      });
    }
  }
  return edges;
}
