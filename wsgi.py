#!/usr/bin/env python3
"""
WSGI configuration for the RAG Chatbot application.
"""

import os
import sys

# Add the project directory to the Python path
project_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_dir)

from app import app, doc_processor

# Initialize document processing on startup
print("Initializing document processing...")
doc_processor.process_documents()
print(f"Processed {len(doc_processor.documents)} document chunks")

# WSGI application
application = app

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
