// src/hooks/useDbtData.ts
import { useState, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { TableMap, LineageData, TableData } from '../types';
import { parseDbtNodes, parseSqlLineageEdges, parseTableLevelEdges } from '../services/dbtParsingService';
import { calculateDynamicLayout } from '../services/layoutService';

interface DbtData {
  allNodes: Node<TableData>[];
  allEdges: Edge[];
  tableMap: TableMap;
  availableTags: string[];
  lineageDate: string;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Custom hook to fetch, parse, and process dbt metadata for the lineage graph.
 */
export function useDbtData(): DbtData {
  const [allNodes, setAllNodes] = useState<Node<TableData>[]>([]);
  const [allEdges, setAllEdges] = useState<Edge[]>([]);
  const [tableMap, setTableMap] = useState<TableMap>({});
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [lineageDate, setLineageDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch all required data in parallel
        const [manifestRes, catalogRes, lineageRes] = await Promise.all([
          fetch('/manifest.json'),
          fetch('/catalog.json'),
          fetch('/lineage.json'),
        ]);

        if (!manifestRes.ok || !catalogRes.ok || !lineageRes.ok) {
          throw new Error('Failed to fetch dbt metadata files.');
        }

        const manifestData = await manifestRes.json();
        const catalogData = await catalogRes.json();
        const lineageJson: LineageData = await lineageRes.json();

        if (lineageJson.date_parsed) {
          setLineageDate(lineageJson.date_parsed);
        }

        // Parse data using our service functions
        const tables = parseDbtNodes(manifestData, catalogData);
        setTableMap(tables);

        const columnEdges = parseSqlLineageEdges(lineageJson, tables);
        const tableEdges = parseTableLevelEdges(lineageJson);
        const parsedEdges = [...columnEdges, ...tableEdges];
        setAllEdges(parsedEdges);

        // Calculate initial layout
        const parsedNodes = calculateDynamicLayout(tables, parsedEdges);
        setAllNodes(parsedNodes);

        // Extract all unique tags for the filter dropdown
        const allTags = new Set<string>();
        Object.values(tables).forEach((table) => {
          table.tags.forEach((tag) => allTags.add(tag));
        });
        setAvailableTags(Array.from(allTags).sort());

      } catch (e) {
        console.error("Failed to load or parse dbt metadata:", e);
        setError(e instanceof Error ? e : new Error('An unknown error occurred'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []); // Empty dependency array ensures this runs only once on mount

  return { allNodes, allEdges, tableMap, availableTags, lineageDate, isLoading, error };
}
