#!/bin/bash

project_dir="/workspaces/realEstateInvesting"
cd "$project_dir"

echo "$(date): Starting setup..."

echo "$(date): Installing requirements..." 
pip install -r "$project_dir/requirements.txt"

echo "$(date): Starting app..."
nohup python "$project_dir/property_analyzer/app.py"

echo "$(date): Setup complete."