// src/App.js

// --- IMPORTS ---
// Imports the necessary libraries from React and React Flow.
import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  addEdge, // Function to add new edges (connections)
  useNodesState, // Hook to manage the state of nodes (tables)
  useEdgesState, // Hook to manage the state of edges (connections)
  Background, // Component to render the graph background
  Controls, // Component that adds zoom and pan controls
  MarkerType, // Used to define the arrowhead type on connections
} from 'reactflow';
import 'reactflow/dist/style.css'; // Default React Flow styles
import TableNode from './TableNode'; // Imports our custom component that renders the tables.

// --- PARSE FUNCTIONS (METADATA TRANSLATION) ---
/**
 * Function to "translate" the raw dbt metadata into a format our visual nodes can understand.
 * It combines information from manifest.json and catalog.json to create the data for each table.
 * @param {object} manifestData - The content of the manifest.json file.
 * @param {object} catalogData - The content of the catalog.json file.
 * @returns {object} - An object where each key is a 'nodeId' and the value contains the formatted table data.
 */
function parseDbtNodes(manifestData, catalogData) {
  const tables = {};
  // Combines 'nodes' (models) and 'sources' from both files to facilitate searching.
  const allManifestNodes = { ...(manifestData.nodes || {}), ...(manifestData.sources || {}) };
  const allCatalogNodes = { ...(catalogData.nodes || {}), ...(catalogData.sources || {}) };

  // Iterates over each item (model or source) found in the manifest.
  for (const nodeId in allManifestNodes) {
    const node = allManifestNodes[nodeId];
    // Ignores items that are not models or sources.
    if (node.resource_type !== 'model' && node.resource_type !== 'source') continue;
    
    // Finds the corresponding item in the catalog to get additional information (like data type).
    const catalogNode = allCatalogNodes[nodeId];
    // If not found in the catalog, skips to the next one to avoid errors.
    if (!catalogNode) continue;

    // Maps the columns, combining data from the manifest and the catalog.
    const columns = Object.keys(node.columns).map((colName) => {
      const col = node.columns[colName];
      const catalogCol = catalogNode.columns[colName];
      return {
        id: `${node.name}-${colName}`, // Unique ID for the column's "handle" (connection point).
        name: colName,
        description: col.description || '',
        type: catalogCol ? catalogCol.type : 'UNKNOWN', // Gets the data type from the catalog.
      };
    });

    // Stores the formatted table data.
    tables[nodeId] = {
      id: nodeId,
      label: node.name,
      resource_type: node.resource_type,
      columns: columns,
    };
  }
  return tables;
}

/**
 * Function to create the edges (connections) based on the SQL parser result (lineage.json).
 * @param {object} lineageData - The content of the lineage.json file.
 * @param {object} tableData - The table data already processed by the parseDbtNodes function.
 * @returns {Array} - An array of edge objects, ready to be used by React Flow.
 */
function parseSqlLineageEdges(lineageData, tableData) {
    // We use a Map to ensure that each connection is unique, even if it appears multiple times in the lineage.
    const edges = new Map();

    // Iterates over each target model (e.g., 'model.my_project.stg_customers').
    for (const targetModelId in lineageData) {
        const modelInfo = lineageData[targetModelId];
        // Iterates over each target column (e.g., 'customer_id').
        for (const targetColumnName in modelInfo.columns) {
            const lineageInfo = modelInfo.columns[targetColumnName];

            // Iterates over the list of sources for that column.
            lineageInfo.lineage.forEach(sourceString => {
                // e.g., "source.my_project.raw.raw_customers.id"
                const parts = sourceString.split('.');
                const sourceColumnName = parts.pop(); // Gets the last part: "id"
                const sourceModelId = parts.join('.'); // Joins the rest: "source.my_project.raw.raw_customers"

                const sourceNode = tableData[sourceModelId];
                const targetNode = tableData[targetModelId];

                // If the source or target nodes are not found, it doesn't create the edge.
                if (!sourceNode || !targetNode) return;

                const edgeId = `e-${sourceModelId}-${targetModelId}-${sourceColumnName}-${targetColumnName}`;
                
                // Adds the edge to the Map if it doesn't exist yet.
                if (!edges.has(edgeId)) {
                    edges.set(edgeId, {
                        id: edgeId,
                        source: sourceModelId, // ID of the source node
                        target: targetModelId, // ID of the target node
                        sourceHandle: `${sourceNode.label}-${sourceColumnName}`, // ID of the source connection point
                        targetHandle: `${targetNode.label}-${targetColumnName}`, // ID of the target connection point
                        animated: false, // Animation will be controlled dynamically
                        markerEnd: { type: MarkerType.ArrowClosed }, // Defines the arrowhead
                        style: { stroke: '#b1b1b7', strokeWidth: 1.5 }, // Default edge style
                    });
                }
            });
        }
    }
    // Returns the list of unique edges.
    return Array.from(edges.values());
}

/**
 * Algorithm to dynamically calculate the position of each node (table).
 * It organizes the tables into layers (vertical columns) based on their dependencies.
 * @param {object} nodesData - The data for all nodes.
 * @param {Array} edgesData - The data for all edges.
 * @returns {Array} - An array of node objects with their calculated (x, y) positions.
 */
function calculateDynamicLayout(nodesData, edgesData) {
    const nodeDepths = new Map(); // Stores the "depth" (layer) of each node.

    // Recursive function to find the layer of a node.
    function getDepth(nodeId) {
        if (nodeDepths.has(nodeId)) return nodeDepths.get(nodeId);
        // Base case: data sources are always at layer 0.
        if (nodeId.startsWith('source.')) {
            nodeDepths.set(nodeId, 0);
            return 0;
        }
        // Finds all direct parents of a node.
        const parents = edgesData.filter(e => e.target === nodeId).map(e => e.source);
        if (parents.length === 0) {
            nodeDepths.set(nodeId, 0);
            return 0;
        }
        // The depth of a node is 1 + the maximum depth among its parents.
        const maxParentDepth = Math.max(...parents.map(p => getDepth(p)));
        const depth = maxParentDepth + 1;
        nodeDepths.set(nodeId, depth);
        return depth;
    }

    // Calculates the depth for all nodes.
    Object.keys(nodesData).forEach(nodeId => getDepth(nodeId));

    // Groups the nodes by layer.
    const layers = new Map();
    nodeDepths.forEach((depth, nodeId) => {
        if (!layers.has(depth)) layers.set(depth, []);
        layers.get(depth).push(nodeId);
    });

    // Constants for the spacing between nodes.
    const HORIZONTAL_SPACING = 400;
    const VERTICAL_SPACING = 300;
    
    const positionedNodes = [];
    // Iterates over each layer to calculate the x and y positions.
    Array.from(layers.keys()).sort((a,b) => a - b).forEach(depth => {
        const layerNodes = layers.get(depth);
        const layerHeight = (layerNodes.length - 1) * VERTICAL_SPACING;
        const startY = -layerHeight / 2; // Centers the column vertically.

        layerNodes.forEach((nodeId, index) => {
            positionedNodes.push({
                id: nodeId,
                type: 'tableNode',
                position: {
                    x: depth * HORIZONTAL_SPACING, // X position based on the layer.
                    y: startY + index * VERTICAL_SPACING // Y position distributed vertically.
                },
                data: nodesData[nodeId],
            });
        });
    });

    return positionedNodes;
}

// Maps the node type name ('tableNode') to the React component that renders it.
const nodeTypes = { tableNode: TableNode };

// --- MAIN APPLICATION COMPONENT ---
function Flow() {
  // --- STATES ---
  // States to store the complete list of nodes and edges (our "master data").
  const [allNodes, setAllNodes] = useState([]);
  const [allEdges, setAllEdges] = useState([]);
  
  // States for the nodes and edges that are visible on the screen (managed by React Flow).
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // State to control the "loading..." screen.
  const [isLoading, setIsLoading] = useState(true);
  
  // New states for the search field and the suggestions list.
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  
  // New state to track the currently selected column for highlighting.
  const [selectedColumn, setSelectedColumn] = useState(null);

  // --- EFFECTS ---
  // This 'useEffect' runs only once, when the component is mounted.
  // Its responsibility is to load all the data from the JSON files.
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Makes the request for the files in the /public folder.
        const manifestRes = await fetch('/manifest.json');
        const catalogRes = await fetch('/catalog.json');
        const lineageRes = await fetch('/lineage.json');
        
        const manifestData = await manifestRes.json();
        const catalogData = await catalogRes.json();
        const lineageData = await lineageRes.json();
        
        // Processes the loaded data.
        const tableData = parseDbtNodes(manifestData, catalogData);
        const parsedEdges = parseSqlLineageEdges(lineageData, tableData);
        const parsedNodes = calculateDynamicLayout(tableData, parsedEdges);

        // Stores the complete list of nodes and edges.
        setAllNodes(parsedNodes);
        setAllEdges(parsedEdges);

        // Sets the initial visible state as the complete graph.
        setNodes(parsedNodes);
        setEdges(parsedEdges);

      } catch (error) {
        console.error("Failed to load or parse dbt metadata:", error);
      } finally {
        setIsLoading(false); // Hides the "loading" screen.
      }
    };
    fetchData();
  }, []); // Empty dependency array means this effect runs only once.

  // This 'useEffect' runs whenever the selected column changes.
  // It is responsible for updating the styles of edges to show highlighting.
  useEffect(() => {
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const isHighlighted = edge.sourceHandle === selectedColumn || edge.targetHandle === selectedColumn;
        return {
          ...edge,
          animated: isHighlighted,
          style: {
            ...edge.style,
            stroke: isHighlighted ? '#00A4C9' : '#b1b1b7',
            strokeWidth: isHighlighted ? 2.5 : 1.5,
          },
          zIndex: isHighlighted ? 100 : 0,
        };
      })
    );
  }, [selectedColumn, setEdges]); // This effect re-runs when 'selectedColumn' or 'setEdges' changes.


  // --- CALLBACK FUNCTIONS ---
  // Function passed down to each TableNode to handle a column click.
  const handleColumnClick = (columnId) => {
    // If the same column is clicked again, deselect it. Otherwise, select the new one.
    setSelectedColumn(prev => (prev === columnId ? null : columnId));
  };

  // Function that applies the filter to the graph based on a search query.
  const applyFilter = (query) => {
    setSelectedColumn(null); // Deselect any column when applying a new filter.
    if (!query) {
      // If the search is empty, restores the full view.
      setNodes(allNodes);
      setEdges(allEdges);
      return;
    }
    const relatedNodeIds = new Set();
    const relatedEdgeIds = new Set();
    // Finds the main node that matches the search.
    const mainNode = allNodes.find(n => n.data.label.toLowerCase() === query.toLowerCase());
    if (mainNode) {
      relatedNodeIds.add(mainNode.id); // Adds the node itself.
      // Iterates through all edges to find direct parents and children.
      allEdges.forEach(edge => {
        if (edge.source === mainNode.id) { // Finds children
          relatedNodeIds.add(edge.target);
          relatedEdgeIds.add(edge.id);
        }
        if (edge.target === mainNode.id) { // Finds parents
          relatedNodeIds.add(edge.source);
          relatedEdgeIds.add(edge.id);
        }
      });
    }
    // Filters the lists to contain only the related nodes and edges.
    const filteredNodes = allNodes.filter(n => relatedNodeIds.has(n.id));
    const filteredEdges = allEdges.filter(e => relatedEdgeIds.has(e.id));
    setNodes(filteredNodes);
    setEdges(filteredEdges);
  };

  // Handles typing in the search field.
  const handleSearchChange = (event) => {
    const query = event.target.value;
    setSearchQuery(query);

    if (query) {
      // Filters the list of all nodes to find matches.
      const matchingNodes = allNodes.filter(node => 
        node.data.label.toLowerCase().includes(query.toLowerCase())
      );
      setSuggestions(matchingNodes);
    } else {
      setSuggestions([]);
      applyFilter(''); // Clears the filter if the search is empty.
    }
  };
  
  // Handles a click on one of the autocomplete suggestions.
  const handleSuggestionClick = (nodeLabel) => {
    setSearchQuery(nodeLabel); // Fills the search field.
    setSuggestions([]); // Hides the suggestions list.
    applyFilter(nodeLabel); // Applies the filter.
  };

  // Function called by React Flow when a new connection is created manually by the user.
  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)), []);

  // --- RENDER ---
  if (isLoading) {
    return <div style={{padding: 20, fontFamily: 'Arial'}}>Loading Data Lineage...</div>;
  }

  // We need to inject the click handler and selected column into the node data for rendering.
  const nodesWithClickHandlers = nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      onColumnClick: handleColumnClick,
      selectedColumn: selectedColumn,
    }
  }));

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      {/* Search box and autocomplete */}
      <div style={{ position: 'absolute', top: 15, left: 15, zIndex: 10 }}>
        <div style={{ position: 'relative', backgroundColor: 'white', padding: '10px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
          <label htmlFor="search" style={{ marginRight: '10px', fontWeight: 'bold' }}>Search Table:</label>
          <input
            id="search"
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="ex: stg_customers"
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '250px' }}
            autoComplete="off"
          />
          {/* Renders the suggestions list if there are any */}
          {suggestions.length > 0 && (
            <ul style={{
              position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white',
              border: '1px solid #ccc', borderTop: 'none', borderRadius: '0 0 8px 8px',
              listStyle: 'none', margin: 0, padding: 0, maxHeight: '200px', overflowY: 'auto',
            }}>
              {suggestions.map(node => (
                <li 
                  key={node.id} 
                  onClick={() => handleSuggestionClick(node.data.label)}
                  style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  {node.data.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Main React Flow component that renders the graph */}
      <ReactFlow
        nodes={nodesWithClickHandlers}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView // Fits the view on initial load so all nodes are visible
        panOnScroll
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default Flow;
