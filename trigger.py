#!/usr/bin/env python3
"""
Premiere Pro Remote Project Creator - Trigger Script
Usage: python trigger.py [project_name] [sequence_name]

No external dependencies required (uses built-in urllib)
"""

import urllib.request
import urllib.error
import json
import sys

SERVER_URL = "http://localhost:3000"

def create_project(project_name=None, sequence_name=None):
    """Trigger new Premiere Pro project creation"""
    
    endpoint = f"{SERVER_URL}/create-project"
    
    payload = {}
    if project_name:
        payload["projectName"] = project_name
    if sequence_name:
        payload["sequenceName"] = sequence_name
    
    print(f"Creating project...")
    print(f"  Server: {endpoint}")
    if payload:
        print(f"  Data: {json.dumps(payload, ensure_ascii=False)}")
    
    try:
        data = json.dumps(payload).encode('utf-8') if payload else b'{}'
        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode('utf-8'))
            
            if result.get("success"):
                print(f"\nSUCCESS!")
                print(f"  Project: {result.get('projectName')}")
                print(f"  Path: {result.get('projectPath')}")
                return True
            else:
                print(f"\nFAILED: {result.get('error', 'Unknown error')}")
                return False
                
    except urllib.error.URLError as e:
        print(f"\nConnection failed: Server not running?")
        print(f"  1. cd server")
        print(f"  2. npm start")
        print(f"  3. Load plugin in Premiere Pro")
        return False
    except Exception as e:
        print(f"\nError: {e}")
        return False

def check_status():
    """Check server status"""
    try:
        req = urllib.request.Request(f"{SERVER_URL}/status")
        with urllib.request.urlopen(req, timeout=5) as response:
            result = json.loads(response.read().decode('utf-8'))
            
            print(f"Server status:")
            print(f"  Connected plugins: {result.get('connectedClients', 0)}")
            print(f"  Save path: {result.get('defaultSavePath', 'N/A')}")
            return result.get('connectedClients', 0) > 0
    except:
        print(f"Cannot connect to server")
        return False

if __name__ == "__main__":
    # Parse command line arguments
    project_name = sys.argv[1] if len(sys.argv) > 1 else None
    sequence_name = sys.argv[2] if len(sys.argv) > 2 else None
    
    print("=" * 50)
    print("Premiere Pro Remote Project Creator")
    print("=" * 50)
    print()
    
    # Check status
    if not check_status():
        print()
        sys.exit(1)
    
    print()
    
    # Create project
    success = create_project(project_name, sequence_name)
    print()
    
    sys.exit(0 if success else 1)
