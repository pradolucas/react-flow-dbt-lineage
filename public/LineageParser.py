import json
import sqlglot
from sqlglot import exp
import sqlglot.lineage as lineage
from sqlglot.optimizer.optimizer import optimize
from sqlglot.optimizer.qualify_columns import qualify_columns
from sqlglot.schema import MappingSchema
from typing import Dict, List, Tuple, Set, Any, Optional
from datetime import datetime

def load_json_file(filepath: str) -> Dict[str, Any]:
    """
    Loads the content of a JSON file from the given path.

    Args:
        filepath: The path to the JSON file.

    Returns:
        A dictionary containing the loaded JSON data, or exits if the file is not found or invalid.
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: File '{filepath}' not found.")
        exit(1)
    except json.JSONDecodeError:
        print(f"Error: File '{filepath}' is not a valid JSON.")
        exit(1)

class LineageParser:
    """
    A class to parse dbt manifest data and generate end-to-end column lineage.
    """
    def __init__(self, manifest_data: Dict[str, Any], catalog_data: Dict[str, Any]):
        """
        Initializes the parser with manifest and catalog data and pre-builds necessary helper maps.
        """
        self.manifest_data = manifest_data
        self.catalog_data = catalog_data
        self.schema, self.table_to_model_map = self._generate_helper_maps()
        self.errors: Dict[str, List[str]] = {}

    def _get_node_columns(self, node_id: str) -> Dict[str, Any]:
        """
        Gets the columns for a given node, checking the manifest first and falling back to the catalog.

        Args:
            node_id: The unique_id of the node.

        Returns:
            A dictionary of columns for the node, or an empty dictionary if none are found.
        """
        # Combine all potential nodes from manifest for easier lookup
        all_manifest_nodes = {**self.manifest_data.get("nodes", {}), **self.manifest_data.get("sources", {})}
        manifest_node = all_manifest_nodes.get(node_id, {})
        columns = manifest_node.get("columns", {})
        
        # If no columns are in the manifest, fall back to the catalog.
        if not columns:
            all_catalog_nodes = {**self.catalog_data.get("nodes", {}), **self.catalog_data.get("sources", {})}
            catalog_node = all_catalog_nodes.get(node_id, {})
            columns = catalog_node.get("columns", {})
            
        return columns

    def _generate_helper_maps(self) -> Tuple[MappingSchema, Dict[str, str]]:
        """
        Generates lookup maps from the manifest data needed for lineage analysis.
        It combines models from 'nodes' and sources from 'sources' for comprehensive mapping.
        The schema_map is built as a MappingSchema object for sqlglot.
        """
        schema_map_dict: Dict[str, Any] = {}
        table_to_model_map: Dict[str, str] = {}
        
        # Combine models and sources into a single dictionary for iteration.
        all_nodes = {**self.manifest_data.get("nodes", {}), **self.manifest_data.get("sources", {})}

        for node_id, node_info in all_nodes.items():
            if node_info.get("resource_type") in ("model", "source"):
                database = node_info.get("database")
                schema_name = node_info.get("schema")
                table_name = node_info.get("alias", node_info.get("name"))

                if database and schema_name and table_name:
                    # Build the table_to_model_map for quick unique_id lookup
                    full_table_name = f"{database}.{schema_name}.{table_name}"
                    table_to_model_map[full_table_name.lower()] = node_id
                    
                    node_columns = self._get_node_columns(node_id)
                    
                    
                    # Build the nested schema_map in the format {catalog: {db: {table: {cols}}}}
                    if not node_columns:
                        print(f"WARNING: No columns found for {full_table_name}.")
                        continue

                    columns = {
                        col_name: col_info.get("type", "UNKNOWN")
                        for col_name, col_info in node_columns.items()
                    }

                    if database not in schema_map_dict:
                        schema_map_dict[database] = {}
                    if schema_name not in schema_map_dict[database]:
                        schema_map_dict[database][schema_name] = {}
                    
                    # The schema requires a set of column names
                    schema_map_dict[database][schema_name][table_name] = columns

        # Return a MappingSchema instance for robust type handling in sqlglot
        return MappingSchema(schema_map_dict), table_to_model_map

    def _generate_table_alias_map(self, sql_expr: exp.Expression) -> Dict[str, str]:
        """
        Creates a map from table aliases to their fully qualified names for a given SQL expression.
        """
        table_alias_map: Dict[str, str] = {}
        for table in sql_expr.find_all(exp.Table):
            if table.catalog and table.db and table.alias:
                table_alias_map[table.alias] = f"{table.catalog}.{table.db}.{table.name}"
        return table_alias_map

    def _look_for_group_by_expr(self, parent_node: lineage.Node) -> Set[str]:
        """
        TODO: Unfinished feature to find columns used in GROUP BY clauses.
        This is a complex task as the columns need to be fully qualified.
        The current logic is a placeholder and may not be robust.
        """
        sources: Set[str] = set()
        # This logic is experimental and relies on unstable internal structures.
        if hasattr(parent_node.source, 'parent_select') and hasattr(parent_node.source.parent_select, 'hashable_args'):
            expres_op_group = [op_exp for op, op_exp in parent_node.source.parent_select.hashable_args if op == 'group']
            if expres_op_group:
                for op in expres_op_group[0]:
                    # Traverse down the expression to find the column
                    while not isinstance(op, exp.Column) and hasattr(op, 'this'):
                        op = op.this
                    if isinstance(op, exp.Column):
                        # This part is incomplete as qualifying the table name is non-trivial here.
                        group_by_column, group_by_table = op.name, op.table
                        sources.add(f"group_by:{group_by_table}.{group_by_column}")
        return sources

    def _trace_lineage_recursively(self, lineage_node: lineage.Node, table_alias_map: Dict[str, str]) -> Set[str]:
        """
        Recursively traverses a lineage graph node to find the ultimate source columns.

        This function acts as the recursive engine. For each parent ("downstream") node
        of the current lineage node, it first attempts to resolve it as a "base source"
        (i.e., a physical table or source defined in the manifest).

        If the parent node is successfully resolved, that lineage path ends.
        If it cannot be resolved (meaning it's an intermediate expression like a column
        from a CTE), the function calls itself on that parent node to continue
        traversing deeper down the lineage path until a base source is found.

        Args:
            lineage_node: The current node in the sqlglot.lineage graph to be explored.
            table_alias_map: A map from table aliases to full table names for the current query.

        Returns:
            A set of strings representing all the ultimate source columns found by
            traversing all downstream paths.
        """
        sources: Set[str] = set()
        for parent_node in lineage_node.downstream:
            # Attempt to resolve the parent node as a direct reference to a base table.
            # This is the "base case" for the recursion.
            base_source = self._resolve_base_source(parent_node, table_alias_map)
            
            if base_source:
                # If successful, a base table was found. Add it to the results and stop this path.
                sources.add(base_source)
            else:
                # If it's not a base source, it must be an intermediate step (e.g., from a CTE).
                # Recurse deeper on this parent node to continue the trace.
                new_sources = self._trace_lineage_recursively(parent_node, table_alias_map)
                sources.update(new_sources)
                
        return sources
    
    def _resolve_base_source(self, parent_node: lineage.Node, table_alias_map: Dict[str, str]) -> Optional[str]:
        """
        Attempts to resolve a lineage node to a fully qualified source column string.
        This function serves as the "base case" checker for the recursion.

        It checks if the node's expression points directly to a physical table (a model or source)
        that exists in the dbt manifest. It handles two common cases:
        1.  `exp.Table`: A direct, fully qualified reference to a table.
        2.  `exp.Placeholder`: An indirect reference, often from a subquery where an alias is used.

        If the node represents a column from a physical table, it returns the formatted
        source string (e.g., 'source.project.raw.table.column').
        If the node represents a column from an intermediate step (like a CTE), it cannot
        be resolved to a base table and this function returns None, signaling that
        the recursion must continue.

        Args:
            parent_node: The lineage node to resolve.
            table_alias_map: A map from table aliases to full table names for the current query.

        Returns:
            A formatted source string if a base table is found, otherwise None.
        """
        # Case 1: The source is a direct reference to a base table.
        if isinstance(parent_node.expression, exp.Table):
            from_column_name = parent_node.name.split('.')[-1]
            from_catalog = parent_node.expression.catalog
            from_schema = parent_node.expression.db
            from_table_name = parent_node.expression.name
            from_full_tablename = f"{from_catalog}.{from_schema}.{from_table_name}"
            
            # TODO: Add columns from GROUP BY clauses to the lineage.
            # group_by_columns = self._look_for_group_by_expr(parent_node)
            # if group_by_columns:
            #     sources.update(group_by_columns)

            parent_model_id = self.table_to_model_map.get(from_full_tablename.lower())
            if parent_model_id:
                return f"{parent_model_id}.{from_column_name}"

        # Case 2: The source is an indirect reference (placeholder), often from a subquery.
        elif isinstance(parent_node.expression, exp.Placeholder):
            from_table_name_alias, from_column_name = parent_node.name.split('.')
            from_full_tablename = table_alias_map.get(from_table_name_alias)
            if from_full_tablename:
                parent_model_id = self.table_to_model_map.get(from_full_tablename.lower())
                if parent_model_id:
                    return f"{parent_model_id}.{from_column_name}"
        
        # If neither case matches, it's not a direct source and needs further recursion.
        return None

    def _expand_star_statements(self, final_sources: Set[str]) -> List[str]:
        """
        Expands 'table.*' references into a full list of columns for that table.
        This handles cases like `row_to_json(table.*)`.

        Args:
            final_sources: A set of source column strings, which may include '.*'.

        Returns:
            A list of fully expanded source column strings.
        """
        expanded_sources: List[str] = []
        for source in final_sources:
            if source.endswith('.*'):
                table_unique_id = source.replace('.*', '')
                # Use the helper to get columns with fallback logic.
                node_columns = self._get_node_columns(table_unique_id)
                if node_columns:
                    all_columns = [f"{table_unique_id}.{column}" for column in node_columns.keys()]
                    expanded_sources.extend(all_columns)
            else:
                expanded_sources.append(source)
        return expanded_sources

    def generate_lineage(self) -> Dict[str, Any]:
        """
        The main orchestrator method. It iterates over all models and their columns
        to generate the complete, end-to-end lineage map and a dictionary of errors,
        returned as a single dictionary.
        """
        lineage_nodes: Dict[str, Any] = {}

        for node_id, node_info in self.manifest_data.get("nodes", {}).items():
            if node_info.get("resource_type") == "model" and node_info.get("compiled_code"):
                sql = node_info["compiled_code"]
                
                # Initialize the result for this node, adding 'depends_on' first and independently.
                model_lineage_result: Dict[str, Any] = {
                    "depends_on": node_info.get("depends_on", {})
                }
                
                try:
                    # Pre-process the SQL once per model for efficiency
                    parsed_sql = sqlglot.parse_one(sql, read="postgres")
                    qualified_sql = parsed_sql.qualify(schema=self.schema, dialect="postgres", quote_identifiers=False)
                    qualified_sql = qualify_columns(parsed_sql, schema=self.schema, dialect="postgres", infer_schema=True)
                    optimized_sql = optimize(qualified_sql, schema=self.schema, dialect='postgres', infer_schema=True)
                    table_alias_map = self._generate_table_alias_map(optimized_sql)
                except Exception as e:
                    if node_id not in self.errors:
                        self.errors[node_id] = []
                    self.errors[node_id].append(f"Could not parse or qualify model: {e}")
                    # Add the node with its dependencies even if SQL parsing fails
                    lineage_nodes[node_id] = model_lineage_result
                    continue

                columns_lineage: Dict[str, Any] = {}
                columns_to_trace = self._get_node_columns(node_id)
                for column_name in columns_to_trace:
                    try:
                        lineage_node = lineage.lineage(sql=optimized_sql, schema=self.schema, column=column_name, dialect="postgres")
                        final_sources = self._trace_lineage_recursively(lineage_node, table_alias_map)
                        expanded_sources = self._expand_star_statements(final_sources)
                        
                        if expanded_sources:
                            columns_lineage[column_name] = {
                                "lineage": sorted(list(set(expanded_sources)))
                            }
                    except Exception as e:
                        if node_id not in self.errors:
                            self.errors[node_id] = []
                        self.errors[node_id].append(f"Could not trace column '{column_name}': {e}")
                
                model_lineage_result["columns"] = columns_lineage
                lineage_nodes[node_id] = model_lineage_result
        
        return {
            "date_parsed": datetime.now().isoformat(),
            "errors": self.errors,
            "nodes": lineage_nodes
        }

def main() -> None:
    """Main function to execute the parser and print the result."""
    manifest_file = "manifest.json"
    catalog_file = "catalog.json"
    
    manifest = load_json_file(manifest_file)
    catalog = load_json_file(catalog_file)
    
    # Instantiate the parser with both files and run the analysis
    parser = LineageParser(manifest, catalog)
    final_output = parser.generate_lineage()
    
    if final_output:
        print(json.dumps(final_output, indent=4))

if __name__ == "__main__":
    main()