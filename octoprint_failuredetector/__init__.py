# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
from flask import Blueprint, send_from_directory # NEW: Import Flask components
import threading
import time
import requests
import os
from PIL import Image
from io import BytesIO
import uuid
import json
import glob
import shutil
import subprocess

# ... (All other imports are the same)

class FailureDetectorPlugin(
    # ... (Other mixins are the same)
    octoprint.plugin.BlueprintPlugin # NEW: Add the BlueprintPlugin mixin
):
    # ... (__init__, on_after_startup, _load_community_credentials, load_model are the same)

    # --- NEW: Implement the Blueprint to serve our temporary frames ---
    def get_blueprint_routes(self):
        # The URL will be /plugin/failuredetector/temp_frame/<path_to_the_image>
        return [
            (r"/temp_frame/(.*)", self.serve_temp_frame)
        ]

    def serve_temp_frame(self, filename):
        # This function securely serves a file ONLY from the timelapse_tmp directory
        temp_dir = self._settings.getBaseFolder("timelapse_tmp")
        return send_from_directory(temp_dir, filename)

    # --- (get_settings_defaults, get_template_configs, get_assets, get_api_commands are the same) ---

    def on_api_command(self, command, data):
        # ... (This method is the same as the last working version)

    def on_event(self, event, payload):
        # ... (This method is the same as the last working version)

    def _extract_frames_from_video(self, filename):
        self._logger.info(f"Extracting frames from {filename} using FFmpeg...")
        # ... (The FFMPEG_AVAILABLE check is the same)
        try:
            # ... (The first part of the extraction logic is the same)
            
            # --- CRITICAL CHANGE: We now send a different base URL to the frontend ---
            self._logger.info(f"Successfully extracted {len(extracted_frame_paths)} frames.")
            self._plugin_manager.send_plugin_message(
                self._identifier, 
                {
                    "type": "frame_list", 
                    "frames": extracted_frame_paths, 
                    # This new 'base' points to our secure Blueprint route
                    "base": f"plugin/{self._identifier}/temp_frame" 
                }
            )
        except Exception as e:
            self._logger.exception(f"An error occurred extracting frames from {filename}:")

    def detection_loop(self):
        while self.is_printing:
            if self.interpreter:
                self.perform_check()
            else:
                self.is_printing = False
                break
            check_interval = self._settings.get_int(["check_interval"])
            for _ in range(check_interval):
                if not self.is_printing: break
                time.sleep(1)

    def perform_check(self):
        self._logger.info("--- Starting Perform Check ---")
        if not self.interpreter or not self.input_details:
            self._logger.error("Aborting check: AI model not loaded.")
            self._plugin_manager.send_plugin_message(self._identifier, dict(status="error", error="AI Model not loaded"))
            return
        self._plugin_manager.send_plugin_message(self._identifier, dict(status="checking"))
        snapshot_url = self._settings.get(["webcam_snapshot_url"])
        try:
            response = requests.get(snapshot_url, timeout=10)
            response.raise_for_status()
            image_bytes = BytesIO(response.content)
            image = Image.open(image_bytes).convert('RGB')
            _, height, width, _ = self.input_details[0]['shape']
            image_resized = image.resize((width, height))
            input_data = np.expand_dims(image_resized, axis=0)
            if self.input_details[0]['dtype'] == np.float32:
                input_data = (np.float32(input_data) - 127.5) / 127.5
            self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
            self.interpreter.invoke()
            output_data = self.interpreter.get_tensor(self.output_details[0]['index'])
            scalar_prob = float(np.squeeze(output_data))
            if len(self.labels) > 1 and self.labels[1] == 'failure':
                failure_prob = scalar_prob
            else:
                failure_prob = 1.0 - scalar_prob
            confidence_threshold = self._settings.get_float(["failure_confidence"])
            if failure_prob > confidence_threshold:
                self._plugin_manager.send_plugin_message(self._identifier, dict(status="failure", result=f"{failure_prob:.2%}", snapshot_url=snapshot_url))
                if self.is_printing:
                    self._printer.pause_print(reason="ai_failure_detection")
                    self.is_printing = False
            else:
                self._plugin_manager.send_plugin_message(self._identifier, dict(status="idle", result=f"{failure_prob:.2%}", snapshot_url=snapshot_url))
        except Exception as e:
            self._logger.exception("An unexpected error occurred in perform_check:")
            self._plugin_manager.send_plugin_message(self._identifier, dict(status="error", error=str(e)))

    def _upload_to_database(self, data):
        self._logger.info("Starting community database upload process...")
        if not self.community_creds or not DATABASE_LIBS_AVAILABLE:
            self._logger.error("Community credentials or database libraries not loaded. Aborting upload.")
            self._plugin_manager.send_plugin_message(self._identifier, {"message": "Error: Backend not configured."})
            return
        try:
            failed_frame_filename = data.get("failed_frame_path")
            if not failed_frame_filename:
                self._logger.error("No failed frame filename was provided.")
                self._plugin_manager.send_plugin_message(self._identifier, {"message": "Error: No frame specified."})
                return
            
            image_bytes = None
            if failed_frame_filename == "last_snapshot.jpg":
                snapshot_url = self._settings.get(["webcam_snapshot_url"])
                response = requests.get(snapshot_url, timeout=10)
                response.raise_for_status()
                image_bytes = BytesIO(response.content)
            else:
                # CORRECTED METHOD
                tmp_dir = self._settings.getBaseFolder("timelapse_tmp")
                full_path_to_image = os.path.join(tmp_dir, failed_frame_filename)
                if not os.path.exists(full_path_to_image):
                    self._logger.error(f"Cannot find specified frame on disk: {full_path_to_image}")
                    self._plugin_manager.send_plugin_message(self._identifier, {"message": "Error: Frame not found."})
                    return
                image_bytes = open(full_path_to_image, "rb")

            s3_client = boto3.client('s3',
                endpoint_url=f"https://{self.community_creds['b2_endpoint_url']}",
                aws_access_key_id=self.community_creds['b2_key_id'],
                aws_secret_access_key=self.community_creds['b2_app_key'])
            unique_filename = f"{data.get('failure_type', 'unknown')}-{uuid.uuid4()}.jpg"
            s3_client.upload_fileobj(image_bytes, self.community_creds['b2_bucket_name'], unique_filename)
            image_public_url = f"https://{self.community_creds['b2_bucket_name']}.{self.community_creds['b2_endpoint_url']}/{unique_filename}"
            
            image_bytes.close()

            if not firebase_admin._apps:
                cred = credentials.Certificate(self.community_creds['firebase_creds'])
                self.firebase_app = firebase_admin.initialize_app(cred)
            db = firestore.client()
            failure_doc = {'image_url': image_public_url, 'failure_type': data.get("failure_type"), 'timestamp': firestore.SERVER_TIMESTAMP, 'plugin_version': self._plugin_version}
            db.collection('failures').add(failure_doc)
            self._logger.info("Successfully uploaded data to community database.")
            self._plugin_manager.send_plugin_message(self._identifier, {"message": "Upload successful!"})
        except Exception as e:
            self._logger.exception("An unexpected error occurred during community database upload:")
            self._plugin_manager.send_plugin_message(self._identifier, {"message": f"Error: {e}"})

    def get_update_information(self):
        return dict(
            failuredetector=dict(
                displayName="AI Failure Detector",
                displayVersion=self._plugin_version,
                type="github_release",
                user="YourUsername",
                repo="Local-Failure-Detection",
                current=self._plugin_version,
                pip="https://github.com/{user}/{repo}/archive/{target_version}.zip"
            )
        )

__plugin_name__ = "AI Failure Detector"
__plugin_pythoncompat__ = ">=3,<4"

def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FailureDetectorPlugin()
    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
    }
