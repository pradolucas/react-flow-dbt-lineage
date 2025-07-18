import json
import sqlglot
from sqlglot import exp
import sqlglot.lineage as lineage

def load_json_file(filepath: str):
    """Carrega o conteúdo de um ficheiro JSON."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Erro: Ficheiro '{filepath}' não encontrado.")
        exit(1)
    except json.JSONDecodeError:
        print(f"Erro: Ficheiro '{filepath}' não é um JSON válido.")
        exit(1)

def generate_models_map(manifest_data):
    # --- Mapas Auxiliares ---
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

    return table_to_model_map

def generate_lineage(manifest_data):
    """
    Go over each column of each model
    """
    models_map = generate_models_map(manifest_data)

    full_result = {}
    for node_id, node_info in manifest_data.get("nodes", {}).items():
        if node_info.get("resource_type") == "model":
            model_lineage_result = {"columns": {}}
            for column_name in node_info.get("columns", {}):
                final_sources = find_lineage_column(node_id, node_info.get("compiled_code"), column_name, models_map)
                model_lineage_result["columns"][column_name] = {
                    "lineage": sorted(list(final_sources))
                    }
            if model_lineage_result["columns"]:
                full_result[node_id] = model_lineage_result

    return full_result

def look_for_group_by_expr(parent_node):
    """TODO
    find a way to get catalog and db of group by columns
    """
    sources = set()
    expres_op_group = [op_exp for op, op_exp in parent_node.source.parent_select.hashable_args if op == 'group'] ## single item
    if(expres_op_group):
        expres_op_group = expres_op_group[0]
        for op in expres_op_group:
            while(not isinstance(op, exp.Column)):
                op = op.this
            group_by_column, group_by_table = op.name, op.table
            sources.update({f"{group_by_table}.{group_by_column}"})
    return sources


def one_level_deeper(lineage_node, schema_map):
    
    sources = set()
    for parent_node in lineage_node.downstream:
        if isinstance(parent_node.expression, exp.Table): # or isinstance(parent_node.source, exp.Table)
            
            from_column_name = parent_node.name.split('.')[1]
            from_catalog = parent_node.source.catalog
            from_schema = parent_node.source.db
            from_table_name = parent_node.source.name
            from_full_name = f"{from_catalog}.{from_schema}.{from_table_name}"

            # group_by_columns = look_for_group_by_expr(parent_node) # assuming all group by from a single table, change that 
            # if(group_by_columns):
            #     sources.update(group_by_columns)

            parent_model_id = schema_map.get(from_full_name.lower())
            sources.update({f"{parent_model_id}.{from_column_name}"})
        else:# elif isinstance(parent_node.expression, exp.Alias):
            from_column_name = parent_node.name.split('.')[1]
            sources = one_level_deeper(parent_node, schema_map)
            sources.update(sources)

    return sources



def find_lineage_column(node_id, sql, column_name, schema_map):

    column_lineage = set()

    try:
        parsed_sql = sqlglot.parse_one(sql, read="postgres")
        qualified_sql = parsed_sql.qualify(schema=schema_map, dialect="postgres", quote_identifiers=False)
        lineage_node = lineage.lineage(sql=qualified_sql, column=column_name, dialect="postgres")
        sources = one_level_deeper(lineage_node, schema_map)
        column_lineage.update(sources)
               
    except Exception as e:
        print(f"Não foi possível analisar o modelo {node_id}: {e}")
    
    return column_lineage





# def find_lineage_column(node_id, sql, column_name, schema_map):

#     column_lineage = set()

#     try:
#         parsed_sql = sqlglot.parse_one(sql, read="postgres")
#         qualified_sql = parsed_sql.qualify(schema=schema_map, dialect="postgres", quote_identifiers=False)
#         lineage_node = lineage.lineage(sql=qualified_sql, column=column_name, dialect="postgres")

#         for parent_node in lineage_node.downstream:
#             ## Base case with no CTES
#             if isinstance(parent_node.expression, exp.Table): # or isinstance(parent_node.source, exp.Table)
#                 # from_column_name = parent_node.source.expression.parent_select

#                 from_column_name = parent_node.name.split('.')[1]
#                 from_catalog = parent_node.source.catalog
#                 from_schema = parent_node.source.db
#                 from_table_name = parent_node.source.name
#                 from_full_name = f"{from_catalog}.{from_schema}.{from_table_name}"

#                 group_by_columns = look_for_group_by_expr(parent_node) # assuming all group by from a single table, change that 
#                 if(group_by_columns):
#                     column_lineage.update(group_by_columns)
                    
#                 parent_model_id = schema_map.get(from_full_name.lower())
#                 column_lineage.update({f"{parent_model_id}.{from_column_name}"})
#             else: #elif isinstance(parent_node.expression, exp.Alias):
#                 from_column_name = parent_node.name.split('.')[1]
#                 sources = one_level_deeper(parent_node, schema_map)
#                 column_lineage.update(sources)
                
#     except Exception as e:
#         print(f"Não foi possível analisar o modelo {node_id}: {e}")
    
#     return column_lineage



def main():
    """Função principal para executar o parser e imprimir o resultado."""
    manifest_file = "manifest.json"
    manifest = load_json_file(manifest_file)
    final_lineage = generate_lineage(manifest)
    print(json.dumps(final_lineage, indent=4))

if __name__ == "__main__":
    main()
