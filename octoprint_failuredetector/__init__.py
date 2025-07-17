# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
import threading
import time
import requests
import os
from PIL import Image
from io import BytesIO

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

    def on_after_startup(self):
        self._logger.info("AI Failure Detector starting up...")
        if not TFLITE_AVAILABLE:
            self._logger.error("TensorFlow Lite runtime is not installed. Plugin will be disabled.")
            return
        self.load_model()

    def load_model(self):
        try:
            model_path = os.path.join(self._basefolder, "print_failure_model.tflite")
            if not os.path.exists(model_path):
                self._logger.error(f"Model file not found at {model_path}. Cannot load model.")
                return

            self._logger.info(f"Loading model from: {model_path}")
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
            # --- Existing Settings ---
            check_interval=15,
            failure_confidence=0.8,
            webcam_snapshot_url="http://127.0.0.1:8080/?action=snapshot",

            # --- NEW: Settings for Data Collection ---
            database_b2_key_id="",
            database_b2_app_key="",
            database_b2_endpoint_url="",
            database_b2_bucket_name="",
            database_firebase_creds_json=""
        )

    def get_template_configs(self):
        return [
            # --- Existing Templates ---
            dict(type="settings", custom_bindings=False),
            dict(type="navbar", custom_bindings=False),
            dict(type="tab", name="Failure Detector", custom_bindings=False),

            # --- NEW: The tab for our Data Collector ---
            dict(
                type="tab",
                name="Data Collector",
                custom_bindings=False,
                template="failuredetector_datacollector_tab.jinja2"
            )
        ]

    def get_assets(self):
        return dict(
            js=[
                "js/failuredetector.js",
                "js/failuredetector_settings.js", # For the test button
            ]
        )

    def get_api_commands(self):
        return dict(
            force_check=[],
            # --- NEW: Command for the Upload button ---
            upload_failure_data=["failure_type"]
        )

    def on_api_command(self, command, data):
        if command == "force_check":
            self._logger.info("Forcing a manual failure check via API.")
            check_thread = threading.Thread(target=self.perform_check)
            check_thread.daemon = True
            check_thread.start()
        
        # --- NEW: Handle the upload command ---
        elif command == "upload_failure_data":
            # For now, we will just log that we received the command and data.
            # In the future, this is where the boto3/firebase code will go.
            self._logger.info("Received request to upload failure data.")
            failure_type = data.get("failure_type")
            self._logger.info(f"Received failure type: {failure_type}")

            # Send a success message back to the UI
            self._plugin_manager.send_plugin_message(self._identifier, {"message": f"'{failure_type}' upload received!"})

    def on_event(self, event, payload):
        if event == "PrintStarted":
            self.is_printing = True
            # ... (rest of method is unchanged)
        elif event in ("PrintDone", "PrintFailed", "PrintCancelled"):
            self.is_printing = False
            # ... (rest of method is unchanged)

    def detection_loop(self):
        # ... (This entire method is unchanged)
        while self.is_printing:
            # ...
    
    def perform_check(self):
        # ... (This entire method is unchanged)
        self._logger.info("--- Starting Perform Check ---")
        # ...

    def get_update_information(self):
        return dict(
            failuredetector=dict(
                displayName="AI Failure Detector", displayVersion=self._plugin_version,
                type="github_release", user="YourUsername", repo="Local-Failure-Detection",
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
