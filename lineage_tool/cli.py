# lineage_tool/cli.py

import argparse
import json
import logging
import os
import time

from .analyzer import analyze_directory
from .utils import setup_logger


def main() -> None:
    """
    Parses command-line arguments and runs the lineage analysis.

    This function sets up the CLI, initiates the analysis based on user input,
    and handles saving the output files (schema and lineage report).
    """
    parser = argparse.ArgumentParser(
        description="Generate table and column lineage from a directory of Greenplum SQL files."
    )
    parser.add_argument(
        "-d",
        "--sql-directory",
        type=str,
        required=True,
        help="The directory containing the .sql files to analyze.",
    )
    parser.add_argument(
        "-s",
        "--schema",
        type=str,
        default=None,
        help="Path to a pre-existing schema JSON file. If provided, database fetching is skipped.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="lineage_results",
        help="The directory where all result files will be saved.",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Set the logging verbosity.",
    )
    args = parser.parse_args()

    try:
        os.makedirs(args.output_dir, exist_ok=True)
    except OSError as e:
        print(f"FATAL: Could not create output directory '{args.output_dir}'. Error: {e}")
        exit(1)

    setup_logger(output_dir=args.output_dir, level=args.log_level)
    logger = logging.getLogger(__name__)

    start_time = time.perf_counter()
    logger.info("Starting lineage analysis process...")

    if not os.path.isdir(args.sql_directory):
        logger.error(f"Directory not found: '{args.sql_directory}'")
        exit(1)

    results = analyze_directory(sql_directory=args.sql_directory, schema_file=args.schema)

    if not results:
        logger.info("Analysis concluded with no results.")
        return

    try:
        logger.info(f"Results will be saved in the '{args.output_dir}' directory.")

        if "schema" in results and results["schema"] is not None:
            schema_path = os.path.join(args.output_dir, "generated_schema.json")
            with open(schema_path, "w", encoding="utf-8") as f:
                json.dump(results["schema"], f, indent=4)
            logger.info(f"Schema saved to '{schema_path}'")

        report_path = os.path.join(args.output_dir, "lineage_report.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(results["report"], f, indent=4)
        logger.info(f"Lineage report saved to '{report_path}'")

    except Exception as e:
        logger.error(f"Failed to write output files. Error: {e}")

    # UPDATED: Replaced the simple summary with a detailed per-table status report
    final_report = results.get("report", {})
    lineage_dict = final_report.get("lineage", {})
    errors_dict = final_report.get("errors", {})
    
    # Tables with errors are any keys in the errors dictionary
    tables_with_errors = list(errors_dict.keys())
    
    # Successful tables are those in the lineage dict but NOT in the errors dict
    successful_tables = [
        tbl for tbl in lineage_dict.keys() if tbl not in errors_dict
    ]

    logger.info("-------------------- Analysis Summary --------------------")
    if not successful_tables and not tables_with_errors:
        logger.info("No tables were processed for lineage.")
    
    if successful_tables:
        logger.info(f"✅ {len(successful_tables)} table(s) traced successfully:")
        for table_name in successful_tables:
            logger.info(f"  - {table_name}")
            
    if tables_with_errors:
        logger.warning(f"❌ {len(tables_with_errors)} table(s) encountered errors:")
        for table_name in tables_with_errors:
            logger.warning(f"  - {table_name}")
        logger.warning("Check the 'errors' section in lineage_report.json for details.")
    
    logger.info("--------------------------------------------------------")


    end_time = time.perf_counter()
    logger.info(f"Analysis complete. Total time: {end_time - start_time:.2f} seconds.")