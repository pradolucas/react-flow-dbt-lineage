import json
import sqlglot
from sqlglot import exp

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

def find_base_sources(expression, sql_context, schema_map, table_to_simple_name_map):
    """
    A recursive helper to find the base table sources for a given expression.
    It traverses through CTEs to find the original source tables.
    Returns a list of tuples: (from_model_name, from_column_name)
    """
    base_sources = []
    # Find all columns within the current expression
    for col_expr in expression.find_all(exp.Column):
        column_name = col_expr.this.this
        table_alias = col_expr.table.this if col_expr.table else None

        if not table_alias:
            continue

        # Check if the column's table is a CTE defined in the current SQL context
        cte = sql_context.find(exp.CTE, lambda c: c.this.this == table_alias)
        if cte:
            # It's a CTE. We need to find the expression for the column within the CTE definition.
            cte_select_statement = cte.this
            for proj in cte_select_statement.expressions:
                proj_alias = None
                proj_expr = None
                if isinstance(proj, exp.Alias):
                    proj_alias = proj.this.this
                    proj_expr = proj.expression
                elif isinstance(proj, exp.Column):
                    proj_alias = proj.this.this
                    proj_expr = proj
                
                # If this projection in the CTE creates our column, recurse into it
                if proj_alias == column_name and proj_expr:
                    base_sources.extend(find_base_sources(proj_expr, cte, schema_map, table_to_simple_name_map))
                    break
        else:
            # It's not a CTE, so it should be a base table.
            # After qualification, the expression should have all parts.
            db = col_expr.catalog.this if col_expr.catalog else None
            schema = col_expr.db.this if col_expr.db else None
            table = col_expr.table.this if col_expr.table else None
            
            if db and schema and table:
                full_name = f"{db}.{schema}.{table}"
                model_name = table_to_simple_name_map.get(full_name.lower())
                if model_name:
                    base_sources.append((model_name, column_name))
                    
    return list(set(base_sources)) # Return unique sources

def analyze_immediate_lineage(manifest_data: dict):
    """
    Analyzes the immediate parent-child column relationships for each model
    and returns a flat list of transformations.
    """
    # --- Helper Maps ---
    schema_map = {}
    table_to_simple_name_map = {}
    for node_id, node_info in manifest_data.get("nodes", {}).items():
        if node_info.get("resource_type") in ("model", "source"):
            database = node_info.get("database")
            schema_name = node_info.get("schema")
            table_name = node_info.get("alias", node_info.get("name"))

            if database and schema_name and table_name:
                full_table_name = f"{database}.{schema_name}.{table_name}"
                table_to_simple_name_map[full_table_name.lower()] = table_name
                columns = {
                    col_name: col_info.get("type", "UNKNOWN")
                    for col_name, col_info in node_info.get("columns", {}).items()
                }
                schema_map[full_table_name] = columns

    lineage_list = []

    # --- Main Loop ---
    for node_id, node_info in manifest_data.get("nodes", {}).items():
        if node_info.get("resource_type") == "model" and node_info.get("compiled_code"):
            to_model_name = node_info.get("name")
            sql = node_info.get("compiled_code")

            try:
                parsed_sql = sqlglot.parse_one(sql, read="postgres")
                qualified_sql = parsed_sql.qualify(schema=schema_map, dialect="postgres", quote_identifiers=False)
                select_expr = qualified_sql.this if isinstance(qualified_sql, exp.With) else qualified_sql

                for projection in select_expr.expressions:
                    if isinstance(projection, exp.Alias):
                        to_column_name = projection.this.this
                        transformation_expr = projection.expression
                    elif isinstance(projection, exp.Column):
                        to_column_name = projection.this.this
                        transformation_expr = projection
                    else:
                        continue
                    
                    # Find all ultimate base sources for the current transformation expression
                    found_sources = find_base_sources(transformation_expr, qualified_sql, schema_map, table_to_simple_name_map)

                    for from_model, from_column in found_sources:
                        # **CHANGE APPLIED HERE**: "transformation" key has been removed.
                        lineage_entry = {
                            "from_model": from_model,
                            "from_column": from_column,
                            "to_model": to_model_name,
                            "to_column": to_column_name
                        }
                        if lineage_entry not in lineage_list:
                            lineage_list.append(lineage_entry)

            except Exception as e:
                print(f"Could not parse model {node_id}: {e}")

    return lineage_list


def main():
    """Main function to run the parser and print the result."""
    manifest_file = "manifest.json"
    manifest = load_json_file(manifest_file)
    final_lineage = analyze_immediate_lineage(manifest)
    if final_lineage:
        print(json.dumps(final_lineage, indent=4))

if __name__ == "__main__":
    main()
