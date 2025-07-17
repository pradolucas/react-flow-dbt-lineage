import json
import sqlglot
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

def analyze_lineage_with_sqlglot(manifest_data: dict):
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
                print(f'Analysing: {full_table_name};\nColumns: {columns};\ntable_model: {table_to_model_map},\nschema_map: {schema_map}')
                print('\n\n\n')

    # Cache to store results of already traced columns
    lineage_cache = {}

    def trace_recursive(model_id: str, column_name: str):
        """
        Recursively traces a column's lineage until it reaches a source table.
        """
        cache_key = (model_id, column_name)
        if cache_key in lineage_cache:
            return lineage_cache[cache_key]

        # Base Case: If the model is a source, we've reached the end.
        if model_id.startswith("source."):
            return {f"{model_id}.{column_name}"}

        node_info = manifest_data["nodes"].get(model_id, {})
        sql = node_info.get("compiled_code")
        if not sql:
            return set()

        try:
            # Find the immediate parent of the current column
            lineage_node = lineage.lineage(
                sql=sql,
                schema=schema_map,
                column=column_name,
                dialect="postgres"
            )
        except Exception:
            return set()
        print(f'lineage_node: {lineage_node}{"\n"*1}')
        # print(f'lineage_node_dir: {dir(lineage_node)}{"\n"*3}')
        # print(f'lineage_node_dir: {lineage_node.to_html()}')

        ultimate_sources = set()
        for parent_node in lineage_node.downstream:
            # **FIX APPLIED HERE**: Use the correct attributes from the lineage.Node object.
            # '.name' gives the column name, and '.source' gives the table expression.
            print(f'lineage_node.downstream: {parent_node}{"\n"*1}')
            parent_column_name = parent_node.name
            parent_table_expr = parent_node.source

            # If the source is not a table (e.g., a literal value), we can't trace it.
            print(f'parent_table_expr_type: {type(parent_table_expr)}')
            print(f'parent_table_expr_type_args: {parent_table_expr.name}{"\n"*1}')
            if not isinstance(parent_table_expr, sqlglot.exp.Table):
                continue

            # Reconstruct the parent table's full name from its parsed components.
            db = parent_table_expr.catalog.this if parent_table_expr.catalog else None
            schema = parent_table_expr.db.this if parent_table_expr.db else None
            table = parent_table_expr.this.this if parent_table_expr.this else None

            # The parser should qualify names; we expect all parts for a full match.
            if not (db and schema and table):
                continue
            
            parent_table_name = f"{db}.{schema}.{table}"
            print(f'parent_table_name: {parent_table_name}{"\n"*3}')
            parent_model_id = table_to_model_map.get(parent_table_name.lower())

            if parent_model_id:
                # Recurse on the parent model and column
                sources = trace_recursive(parent_model_id, parent_column_name)
                ultimate_sources.update(sources)

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


def f(manifest):
    lineage = []

    for node in manifest["nodes"].values():
        if node["resource_type"] != "model":
            continue

        model_name = node["name"]
        sql = node["compiled_code"]
        print(model_name)
        try:
            parsed = sqlglot.parse_one(sql)
            for select in parsed.expressions:
                if select.args.get("alias"):
                    alias = select.args["alias"]
                    expr = select.args["this"]
                    lineage.append({
                        "model": model_name,
                        "column": alias.name,
                        "expression": expr.sql(),
                    })
        except Exception as e:
            print(f"Failed to parse model {model_name}: {e}")

    return lineage
    # print(json.dumps(lineage, indent=2))
        

def main():
    """Main function to run the parser and print the result."""
    manifest_file = "manifest.json"
    manifest = load_json_file(manifest_file)
    final_lineage = analyze_lineage_with_sqlglot(manifest)
    # final_lineage = f(manifest)
    print(json.dumps(final_lineage, indent=2))



if __name__ == "__main__":
    main()
