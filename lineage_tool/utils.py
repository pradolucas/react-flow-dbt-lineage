"""
Provides utility functions for the lineage tool, such as logger configuration.
"""

import logging
import os
from logging import Logger


def setup_logger(output_dir: str, level: str = "INFO") -> Logger:
    """
    Sets up a logger to output to the console and a file.

    The logger is configured to write to `lineage_analysis.log` within the
    specified output directory.

    Args:
        output_dir: The directory where the log file will be created.
        level: The logging level (e.g., "DEBUG", "INFO").

    Returns:
        A configured logging.Logger instance.
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    logger = logging.getLogger("lineage_tool")
    logger.setLevel(log_level)

    if logger.hasHandlers():
        logger.handlers.clear()

    log_file_path = os.path.join(output_dir, "lineage_analysis.log")
    file_handler = logging.FileHandler(log_file_path, mode="w")
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
    logger.addHandler(console_handler)

    file_handler.setLevel(log_level)
    console_handler.setLevel(log_level)

    return logger