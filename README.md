# Git Visualizer

This project is an Electron-based application designed to visualize the internal objects of a Git repository. It provides a graphical interface to explore commits, trees, blobs, and tags, allowing users to understand the structure and history of their repositories. The author had no prior experience with Electron before starting this project.

This is also a playground project for testing out AI agents.

Initial bootstrap was done by Claude 3.7 (chat), with continued improvements via Cline (Gemini 2.5 Flash mostly). Note that user intervention was required once due to a wonky setup generated during the initial bootstrap that no AI could properly untangle.

## Features

- **Repository Selection:** Choose any local Git repository to visualize.
- **Object Listing:** View a comprehensive list of all Git objects within the selected repository.
- **Filtering and Sorting:** Easily filter objects by type and sort them by date, type, or size.
- **Searching:** Search for objects by their hash or content.
- **Object Details:** Examine the detailed content of each object, including parsed tree entries and commit information.
- **Navigation:** Navigate through related objects (e.g., from a commit to its tree) via clickable hash links.

## Setup and Launch

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Launch the Application:**
    ```bash
    npm start
