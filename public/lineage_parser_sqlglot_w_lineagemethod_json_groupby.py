import json
import sqlglot
from sqlglot import exp
import sqlglot.lineage as lineage
from sqlglot.optimizer.optimizer import optimize
from typing import Dict, List, Tuple, Set, Any, Optional

def load_json_file(filepath: str) -> Dict[str, Any]:
    """
    Loads the content of a JSON file from the given path.
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
    def __init__(self, manifest_data: Dict[str, Any]):
        """
        Initializes the parser with manifest data and pre-builds necessary helper maps.
        """
        self.manifest_data = manifest_data
        self.schema_map, self.table_to_model_map = self._generate_helper_maps()

    def _generate_helper_maps(self) -> Tuple[Dict[str, Any], Dict[str, str]]:
        """
        Generates lookup maps from the manifest data needed for lineage analysis.
        """
        schema_map: Dict[str, Any] = {}
        table_to_model_map: Dict[str, str] = {}
        for node_id, node_info in self.manifest_data.get("nodes", {}).items():
            if node_info.get("resource_type") in ("model", "source"):
                database = node_info.get("database")
                schema_name = node_info.get("schema")
                table_name = node_info.get("alias", node_info.get("name"))

                if database and schema_name and table_name:
                    full_table_name = f"{database}.{schema_name}.{table_name}"
                    table_to_model_map[full_table_name.lower()] = node_id
                    columns = {
                        col_name: col_info.get("type", "UNKNOWN")
                        for col_name, col_info in node_info.get("columns", {}).items()
                    }
                    schema_map[full_table_name] = columns
        return schema_map, table_to_model_map

    def _generate_table_alias_map(self, sql_expr: exp.Expression) -> Dict[str, str]:
        """
        Creates a map from table aliases to their fully qualified names for a given SQL expression.
        """
        table_alias_map: Dict[str, str] = {}
        for table in sql_expr.find_all(exp.Table):
            if table.catalog and table.db and table.alias:
                table_alias_map[table.alias] = f"{table.catalog}.{table.db}.{table.name}"
        return table_alias_map

    def _trace_lineage_recursively(self, lineage_node: lineage.Node, table_alias_map: Dict[str, str]) -> Set[str]:
        """
        Recursively traverses a lineage graph node to find the ultimate source columns.
        """
        sources: Set[str] = set()
        for parent_node in lineage_node.downstream:
            # Try to resolve the parent node directly to a base table source.
            base_source = self._resolve_base_source(parent_node, table_alias_map)
            
            if base_source:
                # If successful, it's a base case. Add the source and stop this path.
                sources.add(base_source)
            else:
                # If it's not a base source, it's an intermediate expression (like from a CTE).
                # Recurse deeper to find the ultimate source.
                new_sources = self._trace_lineage_recursively(parent_node, table_alias_map)
                sources.update(new_sources)
                
        return sources
    
    def _resolve_base_source(self, parent_node: lineage.Node, table_alias_map: Dict[str, str]) -> Optional[str]:
        """
        Resolves a lineage node to a source string if it's a base table.
        """
        # Case 1: The source is a direct reference to a base table.
        if isinstance(parent_node.expression, exp.Table):
            from_column_name = parent_node.name.split('.')[-1]
            from_catalog = parent_node.expression.catalog
            from_schema = parent_node.expression.db
            from_table_name = parent_node.expression.name
            from_full_tablename = f"{from_catalog}.{from_schema}.{from_table_name}"
            
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
        
        return None

    def _expand_star_statements(self, final_sources: Set[str]) -> List[str]:
        """
        Expands 'table.*' references into a full list of columns for that table.
        """
        expanded_sources: List[str] = []
        for source in final_sources:
            if source.endswith('.*'):
                table_unique_id = source.replace('.*', '')
                if table_unique_id in self.manifest_data["nodes"]:
                    all_columns = [f"{table_unique_id}.{column}" for column in self.manifest_data["nodes"][table_unique_id]["columns"].keys()]
                    expanded_sources.extend(all_columns)
            else:
                expanded_sources.append(source)
        return expanded_sources

    def generate_lineage(self) -> Dict[str, Any]:
        """
        The main orchestrator method. It iterates over all models and their columns
        to generate the complete, end-to-end lineage map.
        """
        full_result: Dict[str, Any] = {}

        for node_id, node_info in self.manifest_data.get("nodes", {}).items():
            if node_info.get("resource_type") == "model" and node_info.get("compiled_code"):
                sql = node_info["compiled_code"]
                
                try:
                    # Pre-process the SQL once per model for efficiency
                    parsed_sql = sqlglot.parse_one(sql, read="postgres")
                    qualified_sql = parsed_sql.qualify(schema=self.schema_map, dialect="postgres", quote_identifiers=False)
                    optimized_sql = optimize(qualified_sql)
                    table_alias_map = self._generate_table_alias_map(optimized_sql)
                except Exception as e:
                    print(f"Could not parse or qualify model {node_id}: {e}")
                    continue

                model_lineage_result: Dict[str, Any] = {"columns": {}}
                for column_name in node_info.get("columns", {}):
                    try:
                        lineage_node = lineage.lineage(sql=optimized_sql, column=column_name, dialect="postgres")
                        final_sources = self._trace_lineage_recursively(lineage_node, table_alias_map)
                        expanded_sources = self._expand_star_statements(final_sources)
                        
                        if expanded_sources:
                            model_lineage_result["columns"][column_name] = {
                                "lineage": sorted(list(set(expanded_sources)))
                            }
                    except Exception as e:
                        print(f"Could not trace column '{column_name}' in model {node_id}: {e}")
                
                if model_lineage_result["columns"]:
                    full_result[node_id] = model_lineage_result
        return full_result

def main() -> None:
    """Main function to execute the parser and print the result."""
    manifest_file = "manifest.json"
    manifest = load_json_file(manifest_file)
    
    # Instantiate the parser and run the analysis
    parser = LineageParser(manifest)
    final_lineage = parser.generate_lineage()
    
    if final_lineage:
        print(json.dumps(final_lineage, indent=4))

if __name__ == "__main__":
    main()
