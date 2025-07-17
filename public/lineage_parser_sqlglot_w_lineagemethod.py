import json
import sqlglot
from sqlglot import exp
import sqlglot.lineage as lineage

def load_json_file(filepath: str):
    """Loads the content of a JSON file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: File '{filepath}' not found.")
        exit(1)
    except json.JSONDecodeError:
        print(f"Error: File '{filepath}' is not a valid JSON.")
        exit(1)

def analyze_end_to_end_lineage(manifest_data: dict):
    """
    Analyzes the full, recursive lineage for all columns in all models using sqlglot.
    """
    # --- Helper Maps ---
    # 1. Schema map for sqlglot to understand table structures
    schema_map = {}
    # 2. Map from 'database.schema.table' to a model's unique_id
    table_to_model_map = {}
    for node_id, node_info in manifest_data.get("nodes", {}).items():
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

    # Cache to store results of already traced columns
    lineage_cache = {}

    def trace_recursive(model_id: str, column_name: str, sql_context_str: str = None):
        """
        Recursively traces a column's lineage until it reaches a source or model table.
        'sql_context_str' is used when tracing inside a CTE.
        """
        cache_key = (model_id, column_name, sql_context_str)
        if cache_key in lineage_cache:
            return lineage_cache[cache_key]

        # Base Case: If the model is a source, we've reached the end.
        if model_id.startswith("source."):
            return {f"{model_id}.{column_name}"}
        
        # Determine which SQL to parse: the model's SQL or a CTE's SQL
        sql_to_parse = sql_context_str
        if not sql_to_parse:
            node_info = manifest_data["nodes"].get(model_id, {})
            sql_to_parse = node_info.get("compiled_code")

            try:
                # First, parse and qualify the SQL. This resolves all identifiers
                # and is crucial for tracing through aliases and CTEs.
                parsed_sql = sqlglot.parse_one(sql_to_parse, read="postgres")
                qualified_sql = parsed_sql.qualify(schema=schema_map, dialect="postgres", quote_identifiers=False)
                
            except Exception:
                return set()
        else:
            qualified_sql = sql_to_parse
        # if not sql_to_parse:
        #     return set()
        # Find the immediate parent(s) of the current column
        lineage_node = lineage.lineage(sql=qualified_sql, column=column_name)

           

        ultimate_sources = set()
        for parent_node in lineage_node.downstream:
            parent_column_name = parent_node.name.split('.')[1]
            parent_table_expr = parent_node.source
            
            if isinstance(parent_table_expr, exp.Select):
                # Check if the parent is a CTE within the current SQL context
                parent_node_name = parent_node.reference_node_name
                
                # **FIX APPLIED HERE**: More robustly find the CTE by checking the current query context,
                # instead of a broad search.
                cte = None
                # if qualified_sql.ctes:
                for c in qualified_sql.ctes:
                    if c.alias == parent_node_name:
                        cte = c
                        break

                if cte:
                    # If it's a CTE, recurse within the same model_id but use the CTE's SQL
                    sources = trace_recursive(model_id, parent_column_name, sql_context_str=cte.this)
                    ultimate_sources.update(sources)
                # else:
                #     # If it's a base table, find its model_id and recurse on that model
                #     db = parent_table_expr.catalog
                #     schema = parent_table_expr.db 
                #     table = parent_table_expr.this.this if parent_table_expr.this else None

                #     if not (db and schema and table):
                #         continue
                    
                #     parent_table_name = f"{db}.{schema}.{table}"
                #     parent_model_id = table_to_model_map.get(parent_table_name.lower())

                #     if parent_model_id:
                #         sources = trace_recursive(parent_model_id, parent_column_name)
                #         ultimate_sources.update(sources)
                #         print(f'{ultimate_sources=}')
            else:
                db = parent_table_expr.catalog
                schema = parent_table_expr.db 
                table = parent_table_expr.name
                parent_table_name = f"{db}.{schema}.{table}"
                parent_model_id = table_to_model_map.get(parent_table_name.lower())
                
                if parent_model_id:
                    ultimate_sources.update({f"{parent_model_id}.{parent_column_name}"})

                # # Stop tracing if the source is a literal value, not a table.
                # if not isinstance(parent_table_expr, exp.Table):
                #     continue

        lineage_cache[cache_key] = ultimate_sources
        return ultimate_sources

    # --- Main Loop ---
    full_result = {}
    for node_id, node_info in manifest_data.get("nodes", {}).items():
        if node_info.get("resource_type") == "model":
            model_lineage_result = {"columns": {}}
            for column_name in node_info.get("columns", {}):
                final_sources = trace_recursive(node_id, column_name)
                if final_sources:
                    model_lineage_result["columns"][column_name] = {
                        "lineage": sorted(list(final_sources))
                    }
            if model_lineage_result["columns"]:
                full_result[node_id] = model_lineage_result

    return full_result


def main():
    """Main function to run the parser and print the result."""
    manifest_file = "manifest.json"
    manifest = load_json_file(manifest_file)
    final_lineage = analyze_end_to_end_lineage(manifest)
    if final_lineage:
        print(json.dumps(final_lineage, indent=4))

if __name__ == "__main__":
    main()
