# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
import threading
import time
import requests
import os
from PIL import Image
from io import BytesIO
import uuid
import json

# --- (The boto3, firebase_admin, and tflite_runtime imports are the same) ---
try:
    import boto3
    import firebase_admin
    from firebase_admin import credentials, firestore
    DATABASE_LIBS_AVAILABLE = True
except ImportError:
    DATABASE_LIBS_AVAILABLE = False
# ... (tflite imports)

class FailureDetectorPlugin(
    # ... (class definition is the same)
):
    def __init__(self):
        # ... (init is the same)
        self.community_creds = None # To hold our loaded credentials

    def on_after_startup(self):
        self._logger.info("AI Failure Detector starting up...")
        if not TFLITE_AVAILABLE: #... (rest of tflite checks are the same)
        # --- NEW: Load our community credentials on startup ---
        self._load_community_credentials()
        # ... (load_model call is the same)
    
    # --- NEW: Method to load credentials securely ---
    def _load_community_credentials(self):
        creds_path = os.path.join(self._basefolder, "community_db_creds.json")
        try:
            with open(creds_path, 'r') as f:
                self.community_creds = json.load(f)
            self._logger.info("Successfully loaded community database credentials.")
        except Exception as e:
            self._logger.error(f"Could not load community_db_creds.json. Data upload will be disabled. Error: {e}")

    # --- (load_model is the same) ---

    # --- MODIFIED: Remove all database fields from user settings ---
    def get_settings_defaults(self):
        return dict(
            check_interval=15,
            failure_confidence=0.8,
            webcam_snapshot_url="http://127.0.0.1:8080/?action=snapshot"
        )

    # --- (get_template_configs and get_assets are the same as the last working version) ---

    # --- (get_api_commands is the same) ---

    def on_api_command(self, command, data):
        if command == "force_check": #... (same)
        elif command == "upload_failure_data":
            # Start the upload in a background thread
            upload_thread = threading.Thread(target=self._upload_to_database, args=(data,))
            upload_thread.daemon = True
            upload_thread.start()

    # --- MODIFIED: The core upload logic now uses the loaded credentials ---
    def _upload_to_database(self, data):
        self._logger.info("Starting community database upload process...")
        
        # 1. Check if credentials were loaded on startup
        if not self.community_creds:
            self._logger.error("Community credentials not loaded. Aborting upload.")
            self._plugin_manager.send_plugin_message(self._identifier, {"message": "Error: Backend creds missing."})
            return
            
        # ... (The rest of the function is identical to the last version,
        # but it now uses self.community_creds['b2_key_id'] instead of self._settings.get(...)) ...
        
        try:
            # Fetch the snapshot
            snapshot_url = self._settings.get(["webcam_snapshot_url"])
            response = requests.get(snapshot_url, timeout=10)
            response.raise_for_status()
            image_bytes = BytesIO(response.content)

            # Connect to B2 using the loaded credentials
            s3_client = boto3.client(
                's3',
                endpoint_url=f"https://{self.community_creds['b2_endpoint_url']}",
                aws_access_key_id=self.community_creds['b2_key_id'],
                aws_secret_access_key=self.community_creds['b2_app_key']
            )

            # Upload image
            unique_filename = f"failure-{uuid.uuid4()}.jpg"
            s3_client.upload_fileobj(image_bytes, self.community_creds['b2_bucket_name'], unique_filename)
            image_public_url = f"https://{self.community_creds['b2_bucket_name']}.{self.community_creds['b2_endpoint_url']}/{unique_filename}"
            
            # Initialize Firebase
            if not firebase_admin._apps:
                cred = credentials.Certificate(self.community_creds['firebase_creds'])
                firebase_admin.initialize_app(cred)
            
            db = firestore.client()

            # Upload metadata
            failure_doc = {
                'image_url': image_public_url,
                'failure_type': data.get("failure_type"),
                'timestamp': firestore.SERVER_TIMESTAMP,
                'plugin_version': self._plugin_version,
            }
            db.collection('failures').add(failure_doc)

            self._logger.info("Successfully uploaded data to community database.")
            self._plugin_manager.send_plugin_message(self._identifier, {"message": "Upload successful!"})

        except Exception as e:
            self._logger.exception("An error occurred during community database upload:")
            self._plugin_manager.send_plugin_message(self._identifier, {"message": f"Error: {e}"})

    # ... (all other methods and final boilerplate are the same) ...
