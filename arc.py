import os
import time
from pathlib import Path

# ------------------------------------------------------------------------------
# 1) Define .gitignore-style exclusion rules for each stack
# ------------------------------------------------------------------------------

STACKS_GITIGNORE = {
    "javascript": [
        "node_modules/",
        "dist/",
        ".env",
        "npm-debug.log",
        "yarn-error.log",
        ".git/",
        ".data/",
        ".gitignore"
    ],
    "nodejs": [  # Usually same as 'javascript'
        "node_modules/",
        "dist/",
        ".env",
        "npm-debug.log",
        "yarn-error.log"
    ],
    "python": [
        "__pycache__/",
        "*.pyc",
        "*.pyo",
        "*.pyd",
        ".env",
        "env/",
        "venv/",
        "venv.bak/",
        ".venv/",
        ".venv.bak/",
    ],
    "php": [
        "vendor/",
        "composer.lock",
        "composer.phar"
    ],
    "java": [
        "target/",
        "*.class",
        "*.jar",
        "*.war",
        "*.ear",
        ".project",
        ".classpath"
    ],
    ".net": [
        "bin/",
        "obj/",
        "*.exe",
        "*.dll",
        "*.pdb"
    ],
    "c#": [
        "bin/",
        "obj/",
        "*.exe",
        "*.dll",
        "*.pdb"
    ],
    "vb.net": [
        "bin/",
        "obj/",
        "*.exe",
        "*.dll",
        "*.pdb"
    ],
    "c++": [
        "*.o",
        "*.obj",
        "*.exe",
        "*.dll"
    ],
    "rust": [
        "target/",
        "Cargo.lock"
    ],
}

# ------------------------------------------------------------------------------
# 2) Combine default stacks into a single exclusion list
# ------------------------------------------------------------------------------

DEFAULT_STACKS = [
    "javascript",
    "nodejs",
    "python",
    "php",
    "java",
    ".net",
    "c#",
    "vb.net",
    "c++",
    "rust"
]

combined_exclusion_patterns = set()
for stk in DEFAULT_STACKS:
    if stk in STACKS_GITIGNORE:
        combined_exclusion_patterns.update(STACKS_GITIGNORE[stk])

# ------------------------------------------------------------------------------
# 3) Additional excluded extensions (non-text formats)
# ------------------------------------------------------------------------------

EXCLUDED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".bmp",
    ".tiff", ".zip", ".tar", ".gz", ".rar",
    ".7z", ".pdf", ".exe", ".dll", ".bin",
    ".iso"
}

def is_text_file(file_path: Path) -> bool:
    """
    Check if a file should be considered text based on extension.
    """
    return file_path.suffix.lower() not in EXCLUDED_EXTENSIONS

# ------------------------------------------------------------------------------
# 4) Improved matching function for .gitignore-like patterns
# ------------------------------------------------------------------------------

def matches_exclusion_patterns(path_str: str, patterns) -> bool:
    """
    Normalize path to forward slashes, then check patterns.
    - If a pattern ends with '/', we treat it as a directory pattern and check
      if that directory name is in the path components.
    - If a pattern starts with '*.', we treat it as an extension check.
    - Otherwise, we do a naive substring check.

    Example:
        'node_modules/' => exclude if 'node_modules' appears as a path segment
        '*.pyc'         => exclude if path ends with '.pyc'
        'dist'          => exclude if 'dist' is a substring of the path
    """
    # Normalize to forward slashes
    path_str = path_str.replace("\\", "/").lower()
    path_parts = path_str.split("/")  # e.g., ['ui', 'node_modules']

    for pat in patterns:
        pat_lower = pat.lower().strip()

        # Directory pattern (e.g. 'node_modules/')
        if pat_lower.endswith("/"):
            dir_name = pat_lower[:-1]  # remove trailing slash
            # If dir_name is in the path segments, exclude
            if dir_name in path_parts:
                return True

        # Extension-like pattern (e.g. '*.pyc')
        elif pat_lower.startswith("*."):
            if path_str.endswith(pat_lower[1:]):  # remove leading '*'
                return True

        else:
            # Naive substring match
            if pat_lower in path_str:
                return True

    return False

# ------------------------------------------------------------------------------
# 5) Build directory structure as a tree string, skipping excluded dirs/files
# ------------------------------------------------------------------------------

def get_directory_structure(directory: str) -> str:
    """
    Recursively get the directory structure as a tree-like string,
    skipping any folders/files that match the .gitignore-style patterns.
    """
    structure = []
    directory = os.path.abspath(directory)

    for root, dirs, files in os.walk(directory):
        rel_dir = str(Path(root).relative_to(directory))

        # Skip the '.' top-level marker
        if rel_dir == ".":
            rel_dir = ""

        # If this directory (relative path) is excluded, prune
        if rel_dir and matches_exclusion_patterns(rel_dir, combined_exclusion_patterns):
            dirs[:] = []  # do not descend further
            continue

        # Build tree indentation
        level = root.replace(directory, "").count(os.sep)
        indent = "  " * level
        basename = os.path.basename(root) if rel_dir else os.path.basename(directory)
        structure.append(f"{indent}- {basename}/")

        # For each file in this directory
        sub_indent = "  " * (level + 1)
        for file in files:
            rel_file_path = str(Path(root, file).relative_to(directory))
            if matches_exclusion_patterns(rel_file_path, combined_exclusion_patterns):
                continue
            structure.append(f"{sub_indent}- {file}")

    return "\n".join(structure)

# ------------------------------------------------------------------------------
# 6) Main function to create the Markdown snapshot
# ------------------------------------------------------------------------------

def create_markdown_snapshot(directory: str):
    """
    Create a Markdown file containing:
      - The .gitignore-style list of default exclusions
      - The directory structure (excluding matches)
      - The contents of included text files
    """
    # Prepare file name with timestamp
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    dir_path = Path(directory).resolve()
    markdown_filename = f"{dir_path.name}.{timestamp}.md"
    markdown_filepath = dir_path.parent / markdown_filename

    with open(markdown_filepath, "w", encoding="utf-8") as md_file:
        # ----------------------------------------------------------------------
        # Write directory structure
        # ----------------------------------------------------------------------
        md_file.write("# Directory Snapshot\n\n")
        md_file.write("```plaintext\n")
        md_file.write(get_directory_structure(str(dir_path)))
        md_file.write("\n```\n\n")

        # ----------------------------------------------------------------------
        # Traverse files and add their content if not excluded
        # ----------------------------------------------------------------------
        for root, _, files in os.walk(dir_path):
            rel_root = Path(root).relative_to(dir_path)
            rel_root_str = str(rel_root)

            # If the folder itself is excluded, skip
            if rel_root_str != "" and matches_exclusion_patterns(rel_root_str, combined_exclusion_patterns):
                continue

            for file in files:
                file_path = Path(root) / file
                rel_path_str = str(file_path.relative_to(dir_path))

                # Skip if the file matches .gitignore patterns
                if matches_exclusion_patterns(rel_path_str, combined_exclusion_patterns):
                    continue

                # Skip if the file is non-text (by extension)
                if not is_text_file(file_path):
                    continue

                # --------------------------------------------------------------
                # Include text file content in the Markdown
                # --------------------------------------------------------------
                md_file.write(f"## {rel_path_str}\n\n")
                md_file.write(f"**Path:** `{file_path}`\n\n")
                md_file.write("```plaintext\n")
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        md_file.write(f.read())
                except Exception as e:
                    md_file.write(f"Error reading file: {e}")
                md_file.write("\n```\n\n")

    print(f"Markdown snapshot created: {markdown_filepath}")

# ------------------------------------------------------------------------------
# Usage example
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    target_directory = "."  # or specify your directory
    create_markdown_snapshot(target_directory)
