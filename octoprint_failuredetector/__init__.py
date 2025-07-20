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
import glob

try:
    import boto3
    import firebase_admin
    from firebase_admin import credentials, firestore
    DATABASE_LIBS_AVAILABLE = True
except ImportError:
    DATABASE_LIBS_AVAILABLE = False

try:
    from tflite_runtime.interpreter import Interpreter
    import numpy as np
    TFLITE_AVAILABLE = True
except ImportError:
    TFLITE_AVAILABLE = False

class FailureDetectorPlugin(
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.EventHandlerPlugin,
    octoprint.plugin.SettingsPlugin,
    octoprint.plugin.TemplatePlugin,
    octoprint.plugin.SimpleApiPlugin,
    octoprint.plugin.AssetPlugin
):

    def __init__(self):
        self.is_printing = False
        self.detection_thread = None
        self.interpreter = None
        self.input_details = None
        self.output_details = None
        self.labels = []
        self.community_creds = None
        self.firebase_app = None

    def on_after_startup(self):
        self._logger.info("AI Failure Detector starting up...")
        if not TFLITE_AVAILABLE:
            self._logger.error("TensorFlow Lite runtime is not installed. AI features will be disabled.")
        
        self._load_community_credentials()
        self.load_model()

    def _load_community_credentials(self):
        creds_path = os.path.join(self._basefolder, "community_db_creds.json")
        try:
            with open(creds_path, 'r') as f:
                self.community_creds = json.load(f)
            self._logger.info("Successfully loaded community database credentials.")
        except Exception as e:
            self._logger.error(f"Could not load community_db_creds.json. Data upload will be disabled. Error: {e}")

    def load_model(self):
        if not TFLITE_AVAILABLE:
            return
        try:
            model_path = os.path.join(self._basefolder, "print_failure_model.tflite")
            if not os.path.exists(model_path):
                self._logger.error(f"Model file not found at {model_path}. Cannot load AI model.")
                return
            self.interpreter = Interpreter(model_path=model_path)
            self.interpreter.allocate_tensors()
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()
            labels_path = os.path.join(self._basefolder, "labels.txt")
            with open(labels_path, 'r') as f:
                self.labels = [line.strip() for line in f.readlines()]
            self._logger.info("AI Model loaded successfully.")
        except Exception as e:
            self._logger.exception("CRITICAL: Failed to load the AI model. The plugin will not work.")
            self.interpreter = None

    def get_settings_defaults(self):
        return dict(
            check_interval=15,
            failure_confidence=0.8,
            webcam_snapshot_url="http://127.0.0.1:8080/?action=snapshot"
        )

    def get_template_configs(self):
        return [
            dict(type="settings", custom_bindings=False),
            dict(type="navbar", custom_bindings=False),
            dict(type="tab", name="Failure Detector", custom_bindings=False),
            dict(type="generic", template="failuredetector_modal.jinja2")
        ]

    def get_assets(self):
        return dict(
            js=["js/failuredetector.js"]
        )

    def get_api_commands(self):
        return dict(
            force_check=[],
            list_timelapse_frames=[],
            upload_failure_data=[
                "failure_type", "failed_frame_path", 
                "bounding_boxes", "include_settings"
            ]
        )

    def on_api_command(self, command, data):
        if command == "force_check":
            check_thread = threading.Thread(target=self.perform_check)
            check_thread.daemon = True
            check_thread.start()
        
        elif command == "list_timelapse_frames":
            self._logger.info("API call received to list timelapse frames.")
            try:
                timelapse_dir = self._settings.global_get_folder("timelapse")
                frames_full_path = sorted(glob.glob(os.path.join(timelapse_dir, "*.jpg")))
                frame_filenames = [os.path.basename(p) for p in frames_full_path]
                self._logger.info(f"Found {len(frame_filenames)} timelapse frames.")
                self._plugin_manager.send_plugin_message(self._identifier, {"type": "frame_list", "frames": frame_filenames})
            except Exception as e:
                self._logger.exception("Error listing timelapse frames:")
                self._plugin_manager.send_plugin_message(self._identifier, {"type": "frame_list", "frames": [], "error": str(e)})

        elif command == "upload_failure_data":
            self._logger.info(f"Received upload request with data: {data}")
            upload_thread = threading.Thread(target=self._upload_to_database, args=(data,))
            upload_thread.daemon = True
            upload_thread.start()

    def on_event(self, event, payload):
        if event == "PrintStarted":
            self.is_printing = True
            self.detection_thread = threading.Thread(target=self.detection_loop)
            self.detection_thread.daemon = True
            self.detection_thread.start()
        elif event in ("PrintCancelled"):
            self.is_printing = False
            self._plugin_manager.send_plugin_message(self._identifier, dict(status="idle"))
        elif event == "PrintDone":
            self._logger.info("Print finished. Triggering failure report dialog.")
            self.is_printing = False
            self._plugin_manager.send_plugin_message(self._identifier, {"type": "show_post_print_dialog"})

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

# In __init__.py

    # This is the new, upgraded upload function.
    def _upload_to_database(self, data):
        self._logger.info("Starting community database upload process with detailed data...")
        if not self.community_creds or not DATABASE_LIBS_AVAILABLE:
            self._logger.error("Community credentials or database libraries not loaded. Aborting upload.")
            self._plugin_manager.send_plugin_message(self._identifier, {"message": "Error: Backend not configured."})
            return
            
        try:
            # Step 1: Find the correct image file on disk.
            failed_frame_filename = data.get("failed_frame_path")
            if not failed_frame_filename:
                self._logger.error("No failed frame filename was provided.")
                self._plugin_manager.send_plugin_message(self._identifier, {"message": "Error: No frame specified."})
                return

            timelapse_dir = self._settings.global_get_folder("timelapse")
            full_path_to_image = os.path.join(timelapse_dir, failed_frame_filename)

            if not os.path.exists(full_path_to_image):
                self._logger.error(f"Cannot find specified frame on disk: {full_path_to_image}")
                self._plugin_manager.send_plugin_message(self._identifier, {"message": "Error: Frame not found."})
                return

            # Step 2: Connect to Backblaze B2
            s3_client = boto3.client('s3',
                endpoint_url=f"https://{self.community_creds['b2_endpoint_url']}",
                aws_access_key_id=self.community_creds['b2_key_id'],
                aws_secret_access_key=self.community_creds['b2_app_key'])
            
            unique_filename = f"{data.get('failure_type', 'unknown')}-{uuid.uuid4()}.jpg"

            # Step 3: Upload the image from the file path
            with open(full_path_to_image, "rb") as f:
                s3_client.upload_fileobj(f, self.community_creds['b2_bucket_name'], unique_filename)
            
            image_public_url = f"https://{self.community_creds['b2_bucket_name']}.{self.community_creds['b2_endpoint_url']}/{unique_filename}"
            self._logger.info(f"Successfully uploaded image to B2: {image_public_url}")

            # Step 4: Initialize Firebase
            if not firebase_admin._apps:
                cred = credentials.Certificate(self.community_creds['firebase_creds'])
                self.firebase_app = firebase_admin.initialize_app(cred)
            db = firestore.client()

            # Step 5: Prepare the full metadata document
            failure_doc = {
                'image_url': image_public_url,
                'failure_type': data.get("failure_type"),
                'failed_frame_filename': failed_frame_filename,
                'bounding_boxes': data.get("bounding_boxes", []), # Will be empty for now
                'include_settings': data.get("include_settings", False),
                'timestamp': firestore.SERVER_TIMESTAMP,
                'plugin_version': self._plugin_version,
            }
            db.collection('failures').add(failure_doc)
            self._logger.info("Successfully uploaded detailed metadata to Firestore.")

            # Step 6: Report success back to the UI
            self._plugin_manager.send_plugin_message(self._identifier, {"message": "Upload successful!"})

        except Exception as e:
            self._logger.exception("An error occurred during community database upload:")
            self._plugin_manager.send_plugin_message(self._identifier, {"message": f"Error: {e}"})
            
    def get_update_information(self):
        return dict(failuredetector=dict(
            displayName="AI Failure Detector", displayVersion=self._plugin_version,
            type="github_release", user="YourUsername", repo="Local-Failure-Detection",
            current=self._plugin_version,
            pip="https://github.com/{user}/{repo}/archive/{target_version}.zip"
        ))

__plugin_name__ = "AI Failure Detector"
__plugin_pythoncompat__ = ">=3,<4"

def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FailureDetectorPlugin()
    global __plugin_hooks__
    __plugin_hooks__ = {"octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information}
