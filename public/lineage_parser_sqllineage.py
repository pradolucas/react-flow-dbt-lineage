import json
from sqllineage.runner import LineageRunner

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

def analyze_lineage(manifest_data: dict):
    """
    Analyzes the full, recursive lineage for all columns in all models.
    """
    # Create a map from 'database.schema.table' and 'schema.table' to a model's unique_id
    table_to_model_map = {}
    for node_id, node_info in manifest_data.get("nodes", {}).items():
        if node_info.get("resource_type") in ("model", "source"):
            database = node_info.get("database")
            schema_name = node_info.get("schema")
            table_name = node_info.get("alias", node_info.get("name"))

            if schema_name and table_name:
                # Store a two-part name for fallback
                two_part_name = f"{schema_name}.{table_name}"
                table_to_model_map[two_part_name.lower()] = node_id
                # Store a three-part name for primary lookup
                if database:
                    three_part_name = f"{database}.{schema_name}.{table_name}"
                    table_to_model_map[three_part_name.lower()] = node_id

    # Cache to store results of already traced columns
    lineage_cache = {}

    def trace_recursive(model_id: str, column_name: str):
        """
        Recursively traces a column's lineage until it reaches a source table.
        """
        if (model_id, column_name) in lineage_cache:
            return lineage_cache[(model_id, column_name)]

        if model_id.startswith("source."):
            node_info = manifest_data["nodes"].get(model_id, {})
            return {f"{node_info.get('unique_id')}.{column_name}"}

        node_info = manifest_data["nodes"].get(model_id, {})
        sql = node_info.get("compiled_code")
        if not sql:
            return set()

        runner = LineageRunner(sql, dialect="postgres")
        immediate_sources = set()
        
        try:
            for col_lineage in runner.get_column_lineage():
                if col_lineage.target and col_lineage.target.raw_name == column_name:
                    for source_col in col_lineage.sources:
                        immediate_sources.add(source_col)
        except Exception:
            return set()
        
        ultimate_sources = set()
        for parent_col in immediate_sources:
            parent_table_name_full = str(parent_col.parent).lower()
            
            # **FIX APPLIED HERE**: Robust lookup for parent model ID
            parent_model_id = table_to_model_map.get(parent_table_name_full)
            # If 3-part lookup fails, try 2-part lookup
            if not parent_model_id:
                parts = parent_table_name_full.split('.')
                if len(parts) > 1:
                    two_part_name = ".".join(parts[-2:])
                    parent_model_id = table_to_model_map.get(two_part_name)

            if parent_model_id:
                sources = trace_recursive(parent_model_id, parent_col.raw_name)
                ultimate_sources.update(sources)

        lineage_cache[(model_id, column_name)] = ultimate_sources
        return ultimate_sources

    # Main loop to trace all columns in all models
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
    final_lineage = analyze_lineage(manifest)
    if final_lineage:
        print(json.dumps(final_lineage, indent=2))

if __name__ == "__main__":
    main()
