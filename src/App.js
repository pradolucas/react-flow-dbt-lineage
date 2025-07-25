// src/App.js

// --- IMPORTS ---
import React, { useState, useCallback, useEffect } from "react";
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MarkerType,
  MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";
import TableNode from "./TableNode";

// --- PARSE FUNCTIONS ---
function parseDbtNodes(manifestData, catalogData) {
  const tables = {};
  const allManifestNodes = {
    ...(manifestData.nodes || {}),
    ...(manifestData.sources || {}),
  };
  const allCatalogNodes = {
    ...(catalogData.nodes || {}),
    ...(catalogData.sources || {}),
  };

  for (const nodeId in allManifestNodes) {
    const node = allManifestNodes[nodeId];
    if (node.resource_type !== "model" && node.resource_type !== "source")
      continue;
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
      dbtDocsUrl: `https://your-dbt-server.com/#!/model/${nodeId}`,
    };
  }
  return tables;
}

function parseSqlLineageEdges(lineageData, tableData) {
  const edges = new Map();
  for (const targetModelId in lineageData) {
    const modelInfo = lineageData[targetModelId];
    for (const targetColumnName in modelInfo.columns) {
      const lineageInfo = modelInfo.columns[targetColumnName];
      lineageInfo.lineage.forEach((sourceString) => {
        const parts = sourceString.split(".");
        const sourceColumnName = parts.pop();
        const sourceModelId = parts.join(".");
        const sourceNode = tableData[sourceModelId];
        const targetNode = tableData[targetModelId];
        if (!sourceNode || !targetNode) return;

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

function parseTableLevelEdges(lineageNodes) {
  const edges = [];
  for (const targetModelId in lineageNodes) {
    const nodeInfo = lineageNodes[targetModelId];
    if (nodeInfo.depends_on && nodeInfo.depends_on.nodes) {
      nodeInfo.depends_on.nodes.forEach((sourceModelId) => {
        const edgeId = `e-table-${sourceModelId}-to-${targetModelId}`;
        edges.push({
          id: edgeId,
          source: sourceModelId,
          target: targetModelId,
          sourceHandle: "table-dependency-source",
          targetHandle: "table-dependency-target",
          // <--- MODIFIED: Changed edge type to default for a smoother curve --->
          type: "default",
          style: {
            stroke: "#adb5bd",
            strokeWidth: 2,
            strokeDasharray: "5 5",
          },
          zIndex: -1, // Render behind column-level edges
        });
      });
    }
  }
  return edges;
}

function calculateDynamicLayout(nodesData, edgesData) {
  const nodeDepths = new Map();
  function getDepth(nodeId) {
    if (nodeDepths.has(nodeId)) return nodeDepths.get(nodeId);
    if (nodeId.startsWith("source.")) {
      nodeDepths.set(nodeId, 0);
      return 0;
    }
    const parents = edgesData
      .filter((e) => e.target === nodeId)
      .map((e) => e.source);
    if (parents.length === 0) {
      nodeDepths.set(nodeId, 0);
      return 0;
    }
    const maxParentDepth = Math.max(...parents.map((p) => getDepth(p)));
    const depth = maxParentDepth + 1;
    nodeDepths.set(nodeId, depth);
    return depth;
  }
  Object.keys(nodesData).forEach((nodeId) => getDepth(nodeId));
  const layers = new Map();
  nodeDepths.forEach((depth, nodeId) => {
    if (!layers.has(depth)) layers.set(depth, []);
    layers.get(depth).push(nodeId);
  });

  const HORIZONTAL_SPACING = 480;
  const VERTICAL_SPACING = 400;

  const positionedNodes = [];
  Array.from(layers.keys())
    .sort((a, b) => a - b)
    .forEach((depth) => {
      const layerNodes = layers.get(depth);
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
          data: nodesData[nodeId],
        });
      });
    });
  return positionedNodes;
}

const nodeTypes = { tableNode: TableNode };

// --- MAIN COMPONENT ---
function Flow() {
  // --- STATES ---
  const [allNodes, setAllNodes] = useState([]);
  const [allEdges, setAllEdges] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [manuallyRevealedNodeIds, setManuallyRevealedNodeIds] = useState(
    new Set()
  );
  const [lineageDate, setLineageDate] = useState("");

  // --- EFFECTS ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const manifestRes = await fetch("/manifest.json");
        const catalogRes = await fetch("/catalog.json");
        const lineageRes = await fetch("/lineage.json");

        const manifestData = await manifestRes.json();
        const catalogData = await catalogRes.json();
        const lineageJson = await lineageRes.json();

        if (lineageJson.date_parsed) {
          setLineageDate(lineageJson.date_parsed);
        }

        const tableData = parseDbtNodes(manifestData, catalogData);

        const columnEdges = parseSqlLineageEdges(lineageJson.nodes, tableData);
        const tableEdges = parseTableLevelEdges(lineageJson.nodes);
        const parsedEdges = [...columnEdges, ...tableEdges];

        const parsedNodes = calculateDynamicLayout(tableData, parsedEdges);

        const allTags = new Set();
        Object.values(tableData).forEach((table) => {
          table.tags.forEach((tag) => allTags.add(tag));
        });
        setAvailableTags(Array.from(allTags).sort());

        setAllNodes(parsedNodes);
        setAllEdges(parsedEdges);
      } catch (error) {
        console.error("Failed to load or parse dbt metadata:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (allNodes.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get("search");
      const tagsParam = params.get("tags");

      if (searchParam) {
        setSearchQuery(searchParam);
      } else if (tagsParam) {
        setSelectedTags(tagsParam.split(","));
      }
    }
  }, [allNodes]);

  useEffect(() => {
    if (isLoading) return;

    const params = new URLSearchParams();
    if (searchQuery) {
      params.set("search", searchQuery);
    } else if (selectedTags.length > 0) {
      params.set("tags", selectedTags.join(","));
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({ path: newUrl }, "", newUrl);
  }, [searchQuery, selectedTags, isLoading]);

  // <--- MODIFIED: Corrected filter logic to prevent multi-level expansion
  useEffect(() => {
    if (allNodes.length === 0) return;

    const baseNodes = new Set();
    const primaryFilterIsActive = searchQuery || selectedTags.length > 0;

    // Step 1: Gather base nodes from primary filters (search/tags)
    if (primaryFilterIsActive) {
      if (searchQuery) {
        const matchingNodes = allNodes.filter(
          (node) =>
            node.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.data.columns.some((col) =>
              col.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
        );
        matchingNodes.forEach((n) => baseNodes.add(n.id));
      } else {
        // Tags are selected
        const tagNodes = allNodes.filter((n) =>
          selectedTags.some((tag) => n.data.tags?.includes(tag))
        );
        tagNodes.forEach((n) => baseNodes.add(n.id));
      }
    }

    // Step 2: Add any nodes that were manually revealed to the base set
    manuallyRevealedNodeIds.forEach((id) => baseNodes.add(id));

    // Step 3: If there are no base nodes from any source, show everything
    if (baseNodes.size === 0) {
      setNodes(allNodes);
      setEdges(allEdges);
      return;
    }

    // Step 4: The final set to show is the base set PLUS their direct neighbors
    const nodesToShowIds = new Set(baseNodes);
    baseNodes.forEach((nodeId) => {
      allEdges.forEach((edge) => {
        if (edge.source === nodeId) nodesToShowIds.add(edge.target);
        if (edge.target === nodeId) nodesToShowIds.add(edge.source);
      });
    });

    const filteredNodes = allNodes.filter((n) => nodesToShowIds.has(n.id));
    const filteredEdges = allEdges.filter(
      (e) => nodesToShowIds.has(e.source) && nodesToShowIds.has(e.target)
    );
    const nodesDataObject = filteredNodes.reduce((acc, node) => {
      acc[node.id] = node.data;
      return acc;
    }, {});

    const relayoutedNodes = calculateDynamicLayout(
      nodesDataObject,
      filteredEdges
    );
    setNodes(relayoutedNodes);
    setEdges(filteredEdges);
  }, [searchQuery, selectedTags, manuallyRevealedNodeIds, allNodes, allEdges]);

  useEffect(() => {
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const isHighlighted =
          selectedColumns.includes(edge.sourceHandle) ||
          selectedColumns.includes(edge.targetHandle);
        return {
          ...edge,
          animated: isHighlighted,
          style: {
            ...edge.style,
            stroke: isHighlighted ? "#00A4C9" : edge.style.stroke,
            strokeWidth: isHighlighted ? 2.5 : edge.style.strokeWidth,
          },
          zIndex: isHighlighted ? 100 : edge.zIndex,
        };
      })
    );
  }, [selectedColumns, setEdges]);

  // --- CALLBACK FUNCTIONS ---
  const handleToggleNodeExpand = useCallback(
    (nodeId) => {
      setExpandedNodes((prevExpanded) => {
        const newExpanded = new Set(prevExpanded);
        if (newExpanded.has(nodeId)) {
          newExpanded.delete(nodeId);
          return newExpanded;
        } else {
          const nodesToExpand = new Set([nodeId]);
          const clickedNode = allNodes.find((n) => n.id === nodeId);
          if (clickedNode) {
            const allColumnIds = clickedNode.data.columns.map((col) => col.id);
            allEdges.forEach((edge) => {
              if (
                allColumnIds.includes(edge.sourceHandle) ||
                allColumnIds.includes(edge.targetHandle)
              ) {
                nodesToExpand.add(edge.source);
                nodesToExpand.add(edge.target);
              }
            });
          }
          return new Set([...newExpanded, ...nodesToExpand]);
        }
      });
    },
    [allNodes, allEdges]
  );

  const handleColumnClick = (columnId) => {
    setSelectedColumns((prev) =>
      prev.length === 1 && prev[0] === columnId ? [] : [columnId]
    );
  };

  const handleSearchChange = (event) => {
    const query = event.target.value;
    setSearchQuery(query);
    setManuallyRevealedNodeIds(new Set());
    setSelectedTags([]);
    setSelectedColumns([]);
    if (query) {
      const newSuggestions = [];
      const addedTables = new Set();
      allNodes.forEach((node) => {
        if (
          node.data.label.toLowerCase().includes(query.toLowerCase()) &&
          !addedTables.has(node.data.label)
        ) {
          newSuggestions.push({ type: "table", label: node.data.label });
          addedTables.add(node.data.label);
        }
        node.data.columns.forEach((col) => {
          if (col.name.toLowerCase().includes(query.toLowerCase())) {
            newSuggestions.push({
              type: "column",
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

  const handleSuggestionClick = (suggestion) => {
    const tableLabel = suggestion.tableLabel || suggestion.label;
    setSearchQuery(tableLabel);
    setManuallyRevealedNodeIds(new Set());
    const targetNode = allNodes.find((node) => node.data.label === tableLabel);
    if (targetNode) {
      const nodesToExpand = new Set([targetNode.id]);
      let columnsToSelect = [];
      if (suggestion.type === "table") {
        const allColumnIds = targetNode.data.columns.map((col) => col.id);
        columnsToSelect = allColumnIds;
        allEdges.forEach((edge) => {
          if (
            allColumnIds.includes(edge.sourceHandle) ||
            allColumnIds.includes(edge.targetHandle)
          ) {
            nodesToExpand.add(edge.source);
            nodesToExpand.add(edge.target);
          }
        });
      } else {
        columnsToSelect = [suggestion.columnId];
        allEdges.forEach((edge) => {
          if (
            edge.sourceHandle === suggestion.columnId ||
            edge.targetHandle === suggestion.columnId
          ) {
            nodesToExpand.add(edge.source);
            nodesToExpand.add(edge.target);
          }
        });
      }
      setSelectedColumns(columnsToSelect);
      setExpandedNodes((prev) => new Set([...prev, ...nodesToExpand]));
    }
    setSuggestions([]);
  };

  const handleNodeClick = useCallback(
    (event, node) => {
      const targetNode = allNodes.find((n) => n.id === node.id);
      if (!targetNode) return;
      const nodesToExpand = new Set([targetNode.id]);
      const allColumnIds = targetNode.data.columns.map((col) => col.id);
      allEdges.forEach((edge) => {
        if (
          allColumnIds.includes(edge.sourceHandle) ||
          allColumnIds.includes(edge.targetHandle)
        ) {
          nodesToExpand.add(edge.source);
          nodesToExpand.add(edge.target);
        }
      });
      setSelectedColumns(allColumnIds);
      setExpandedNodes((prev) => new Set([...prev, ...nodesToExpand]));
    },
    [allNodes, allEdges]
  );

  const handleTagSelectionChange = (tag) => {
    setSearchQuery("");
    setManuallyRevealedNodeIds(new Set());
    setSelectedColumns([]);
    setSelectedTags((prevTags) => {
      const newTags = new Set(prevTags);
      if (newTags.has(tag)) newTags.delete(tag);
      else newTags.add(tag);
      return Array.from(newTags);
    });
  };

  // <--- MODIFIED: Corrected logic to only add the clicked node to the set
  const handleRevealNeighbors = useCallback((nodeId) => {
    setManuallyRevealedNodeIds((prev) => new Set([...prev, nodeId]));
  }, []);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedTags([]);
    setSuggestions([]);
    setSelectedColumns([]);
    setManuallyRevealedNodeIds(new Set());
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    []
  );

  // --- RENDER ---
  if (isLoading) {
    return (
      <div style={{ padding: 20, fontFamily: "Arial" }}>
        Loading Data Lineage...
      </div>
    );
  }

  const nodesWithClickHandlers = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      onColumnClick: handleColumnClick,
      selectedColumns: selectedColumns,
      onToggleExpand: handleToggleNodeExpand,
      isExpanded: expandedNodes.has(node.id),
      onRevealNeighbors: handleRevealNeighbors,
    },
  }));

  const formattedDate = lineageDate
    ? new Date(lineageDate).toLocaleString()
    : "N/A";

  const searchContainerStyle = {
    position: "relative",
    backgroundColor: "white",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    padding: "0 15px",
    border: "1px solid #ccc",
    transition: "border-color 0.2s, box-shadow 0.2s",
    height: "42px",
    borderColor: isSearchFocused ? "#00A4C9" : "#ccc",
    boxShadow: isSearchFocused
      ? "0 0 0 3px rgba(0, 164, 201, 0.2)"
      : "0 2px 10px rgba(0,0,0,0.1)",
  };

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 15,
          left: 15,
          zIndex: 10,
          display: "flex",
          gap: "15px",
          alignItems: "center",
        }}
      >
        {/* Search Input */}
        <div style={{ position: "relative" }}>
          <div style={searchContainerStyle}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#999"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              id="search"
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => {
                setIsSearchFocused(true);
                setIsTagDropdownOpen(false);
              }}
              onBlur={() => {
                setTimeout(() => setIsSearchFocused(false), 200);
              }}
              placeholder="Search table or column..."
              style={{
                marginLeft: "10px",
                border: "none",
                outline: "none",
                height: "100%",
                width: "250px",
                fontSize: "14px",
                backgroundColor: "transparent",
              }}
              autoComplete="off"
            />
          </div>
          {isSearchFocused && suggestions.length > 0 && (
            <ul
              style={{
                position: "absolute",
                top: "110%",
                left: 0,
                right: 0,
                backgroundColor: "white",
                border: "1px solid #eee",
                borderRadius: "8px",
                listStyle: "none",
                margin: 0,
                padding: "5px 0",
                maxHeight: "200px",
                overflowY: "auto",
                zIndex: 21,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
            >
              {suggestions.map((s, i) => (
                <li
                  key={`${s.label || s.columnLabel}-${i}`}
                  onClick={() => handleSuggestionClick(s)}
                  style={{ padding: "10px 15px", cursor: "pointer" }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = "#f0f8ff")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.backgroundColor = "white")
                  }
                >
                  {s.type === "column" ? (
                    <span>
                      {s.tableLabel} &gt; <strong>{s.columnLabel}</strong>
                    </span>
                  ) : (
                    s.label
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tag Filter */}
        <div style={{ position: "relative" }}>
          <div
            onClick={() => setIsTagDropdownOpen((prev) => !prev)}
            title="Filter by Tag"
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "42px",
              height: "42px",
              border:
                selectedTags.length > 0
                  ? "2px solid #00A4C9"
                  : "1px solid #ccc",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
              <line x1="7" y1="7" x2="7.01" y2="7"></line>
            </svg>
            {selectedTags.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-5px",
                  right: "-5px",
                  background: "#d32f2f",
                  color: "white",
                  borderRadius: "50%",
                  width: "20px",
                  height: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
              >
                {selectedTags.length}
              </span>
            )}
          </div>
          {isTagDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                width: "220px",
                background: "white",
                border: "1px solid #ccc",
                borderRadius: "4px",
                marginTop: "5px",
                maxHeight: "300px",
                overflowY: "auto",
                zIndex: 20,
                boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
              }}
            >
              {availableTags.map((tag) => (
                <div
                  key={tag}
                  style={{
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    background: selectedTags.includes(tag)
                      ? "#e0f7fa"
                      : "white",
                  }}
                  onClick={() => handleTagSelectionChange(tag)}
                >
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(tag)}
                    readOnly
                    style={{ marginRight: "10px", pointerEvents: "none" }}
                  />
                  <label style={{ cursor: "pointer" }}>{tag}</label>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clear Filters Button */}
        {(searchQuery ||
          selectedTags.length > 0 ||
          selectedColumns.length > 0 ||
          manuallyRevealedNodeIds.size > 0) && (
          <div
            onClick={handleClearFilters}
            title="Clear Filters & Selections"
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "42px",
              height: "42px",
              border: "1px solid #ccc",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#d32f2f"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </div>
        )}
      </div>

      {lineageDate && (
        <div
          style={{
            position: "absolute",
            top: 15,
            right: 15,
            zIndex: 10,
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            padding: "6px 12px",
            borderRadius: "6px",
            fontFamily: "Arial, sans-serif",
            fontSize: "12px",
            color: "#374151",
            boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          }}
        >
          <strong>Last Updated:</strong> {formattedDate}
        </div>
      )}

      <ReactFlow
        nodes={nodesWithClickHandlers}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        panOnScroll
        onPaneClick={() => {
          setIsTagDropdownOpen(false);
          setSelectedColumns([]);
        }}
      >
        <Background />
        <Controls />
        <MiniMap
          pannable={true}
          zoomable={true}
          inversePan={true}
          zoomStep={5}
          style={{
            backgroundColor: "#f8f9fa",
            border: "1px solid #dee2e6",
            borderRadius: "8px",
          }}
          nodeColor={(node) => {
            if (node.data.resource_type === "source") return "#2f855a";
            return "#2d3748";
          }}
          nodeStrokeWidth={3}
          maskColor="rgba(233, 236, 239, 0.8)"
        />
      </ReactFlow>
    </div>
  );
}

export default Flow;
