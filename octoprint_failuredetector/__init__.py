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
    octoprint.plugin.StartupPlugin, octoprint.plugin.EventHandlerPlugin,
    octoprint.plugin.SettingsPlugin, octoprint.plugin.TemplatePlugin,
    octoprint.plugin.SimpleApiPlugin, octoprint.plugin.AssetPlugin
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
            check_interval=15, failure_confidence=0.8,
            webcam_snapshot_url="http://127.0.0.1:8080/?action=snapshot"
        )

    def get_template_configs(self):
        return [
            dict(type="navbar", custom_bindings=False),
            dict(type="settings", custom_bindings=False),
            dict(type="tab", name="Failure Detector", custom_bindings=False)
        ]

    def get_assets(self):
        return dict(js=["js/failuredetector.js", "js/failuredetector_settings.js"])

    def get_api_commands(self):
        return dict(force_check=[])

    def on_api_command(self, command, data):
        if command == "force_check":
            self._logger.info("Forcing a manual failure check via API.")
            check_thread = threading.Thread(target=self.perform_check)
            check_thread.daemon = True
            check_thread.start()

    def on_event(self, event, payload):
        if event == "PrintStarted":
            self.is_printing = True
            self._logger.info("Print started. AI monitoring is now active.")
            self.detection_thread = threading.Thread(target=self.detection_loop)
            self.detection_thread.daemon = True
            self.detection_thread.start()
        elif event in ("PrintDone", "PrintFailed", "PrintCancelled"):
            self._logger.info("Print ended. AI monitoring is now inactive.")
            self.is_printing = False
            self._plugin_manager.send_plugin_message(self._identifier, dict(status="idle"))

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

 # In __init__.py

    def perform_check(self):
        self._logger.info("--- Starting Perform Check ---")
        
        if not self.interpreter or not self.input_details:
            self._logger.error("Aborting check: The AI model was not loaded correctly on startup.")
            self._plugin_manager.send_plugin_message(self._identifier, dict(status="error", error="AI Model not loaded"))
            return

        self._plugin_manager.send_plugin_message(self._identifier, dict(status="checking"))
        snapshot_url = self._settings.get(["webcam_snapshot_url"])
        
        try:
            self._logger.info(f"Attempting to get image from: {snapshot_url}")
            response = requests.get(snapshot_url, timeout=10)
            response.raise_for_status()
            self._logger.info("Successfully received image data.")

            image_bytes = BytesIO(response.content)
            image = Image.open(image_bytes).convert('RGB')
            
            self._logger.info("Preprocessing image for AI model...")
            _, height, width, _ = self.input_details[0]['shape']
            image_resized = image.resize((width, height))
            input_data = np.expand_dims(image_resized, axis=0)
            if self.input_details[0]['dtype'] == np.float32:
                input_data = (np.float32(input_data) - 127.5) / 127.5
            
            self._logger.info("Invoking TFLite interpreter...")
            self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
            self.interpreter.invoke()
            self._logger.info("Interpreter finished.")
            
            output_data = self.interpreter.get_tensor(self.output_details[0]['index'])
            
            # --- THE CRITICAL FIX IS HERE ---
            # Convert the 0D NumPy array to a simple Python float immediately.
            scalar_prob = float(np.squeeze(output_data))

            # By Keras/TF convention, a single output neuron with a sigmoid function
            # gives the probability of the class at index 1.
            # We check which label is at index 1 to see what this number means.
            if self.labels[1] == 'failure':
                failure_prob = scalar_prob
            else: # This assumes the label at index 0 is 'failure'
                failure_prob = 1.0 - scalar_prob
            # --- END OF CRITICAL FIX ---

            confidence_threshold = self._settings.get_float(["failure_confidence"])
            self._logger.info(f"AI analysis complete. Failure probability: {failure_prob:.2%}")

            if failure_prob > confidence_threshold:
                self._logger.warning(f"FAILURE DETECTED! (Confidence: {failure_prob:.2%})")
                self._plugin_manager.send_plugin_message(self._identifier, dict(status="failure", result=f"{failure_prob:.2%}", snapshot_url=snapshot_url))
                if self.is_printing:
                    self._logger.info("Print is active. Pausing print.")
                    self._printer.pause_print(reason="ai_failure_detection")
                    self.is_printing = False
            else:
                self._logger.info("No failure detected.")
                self._plugin_manager.send_plugin_message(self._identifier, dict(status="idle", result=f"{failure_prob:.2%}", snapshot_url=snapshot_url))
            
            self._logger.info("--- Perform Check Finished ---")

        except Exception as e:
            self._logger.exception("An unexpected error occurred in perform_check. This is the traceback:")
            self._plugin_manager.send_plugin_message(self._identifier, dict(status="error", error=str(e)))
            
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
