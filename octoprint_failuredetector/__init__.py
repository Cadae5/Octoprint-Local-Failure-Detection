# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
import threading
import time
import requests
import os
from PIL import Image
from io import BytesIO

# Attempt to import the TensorFlow Lite runtime and NumPy.
# If they are not available, the plugin will disable itself.
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
    octoprint.plugin.AssetPlugin
):

    def __init__(self):
        """Initializes the plugin's state."""
        self.is_printing = False
        self.detection_thread = None

        # AI Model related attributes will be initialized in load_model()
        self.interpreter = None
        self.input_details = None
        self.output_details = None
        self.labels = []

    # ~~ StartupPlugin mixin ~~
    def on_after_startup(self):
        """Called once after OctoPrint starts up."""
        self._logger.info("AI Failure Detector starting up...")
        if not TFLITE_AVAILABLE:
            self._logger.error("TensorFlow Lite runtime is not installed. Plugin will be disabled.")
            self._plugin_manager.disable_plugin(self._identifier)
            return
        
        # Load the AI model in a non-blocking way
        self.load_model()

    def load_model(self):
        """Loads the TFLite model and labels from the plugin's bundled files."""
        try:
            # Construct the absolute path to the model and labels files
            model_path = os.path.join(self._basefolder, "print_failure_model.tflite")
            labels_path = os.path.join(self._basefolder, "labels.txt")
            
            if not os.path.exists(model_path) or not os.path.exists(labels_path):
                self._logger.error("Model or labels file not found in the plugin directory.")
                return

            # Load the TFLite model and allocate tensors
            self.interpreter = Interpreter(model_path=model_path)
            self.interpreter.allocate_tensors()

            # Get model input and output details
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()
            
            # Load the labels from labels.txt
            with open(labels_path, 'r') as f:
                self.labels = [line.strip() for line in f.readlines()]
            
            self._logger.info(f"AI Model loaded successfully from: {model_path}")
            self._logger.info(f"Labels loaded: {self.labels}")
            
            # Sanity check: ensure 'failure' is one of the labels
            if 'failure' not in self.labels:
                 self._logger.warning("The label 'failure' was not found in labels.txt. Detection may not work as expected.")

        except Exception as e:
            self._logger.error(f"An error occurred while loading the AI model: {e}")
            self.interpreter = None # Disable inference if loading fails

    # ~~ SettingsPlugin mixin ~~
    def get_settings_defaults(self):
        """Defines the default settings for the plugin."""
        return dict(
            check_interval=15,  # Time in seconds between checks
            failure_confidence=0.8, # 80% confidence threshold to trigger a pause
            webcam_snapshot_url="http://127.0.0.1:8080/?action=snapshot"
        )
    
    # ~~ TemplatePlugin mixin ~~
    def get_template_configs(self):
        """Defines UI templates. We add a settings panel."""
        return [dict(type="settings", custom_bindings=False)]

    # ~~ AssetPlugin mixin ~~
    def get_assets(self):
        """Defines the plugin's static assets (JS, CSS)."""
        # We don't have any for this simple plugin, but the hook is here for future expansion.
        return dict(
            js=[],
            css=[]
        )

    # ~~ EventHandlerPlugin mixin ~~
    def on_event(self, event, payload):
        """Reacts to events fired by OctoPrint."""
        if event == "PrintStarted":
            self.is_printing = True
            self._logger.info("Print started. AI monitoring is now active.")
            
            # Start the detection loop in a separate thread to not block OctoPrint
            self.detection_thread = threading.Thread(target=self.detection_loop)
            self.detection_thread.daemon = True # Allows OctoPrint to exit even if thread is running
            self.detection_thread.start()
        
        elif event in ("PrintDone", "PrintFailed", "PrintCancelled"):
            self._logger.info("Print ended. AI monitoring is now inactive.")
            self.is_printing = False # Signal the thread to stop

    def detection_loop(self):
        """The main loop that periodically checks for print failures."""
        while self.is_printing:
            # Only run the check if the model was loaded successfully
            if self.interpreter:
                self.perform_check()
            else:
                self._logger.warning("Skipping check because the AI model is not loaded.")
                # Stop the loop if the model isn't available
                self.is_printing = False
                break

            # Wait for the configured interval before the next check
            check_interval = self._settings.get_int(["check_interval"])
            # We check the is_printing flag again after sleeping
            # in case the print was cancelled during the wait.
            for _ in range(check_interval):
                if not self.is_printing:
                    break
                time.sleep(1)

    def perform_check(self):
        """Captures a webcam image, runs inference, and pauses the print on failure."""
        try:
            # 1. CAPTURE IMAGE
            snapshot_url = self._settings.get(["webcam_snapshot_url"])
            response = requests.get(snapshot_url, timeout=5)
            response.raise_for_status() # Raise an HTTPError for bad responses (4xx or 5xx)
            
            image_bytes = BytesIO(response.content)
            image = Image.open(image_bytes).convert('RGB') # Ensure image is in RGB format

            # 2. PREPROCESS IMAGE
            # Get the expected input size from the model's details
            _, height, width, _ = self.input_details[0]['shape']
            image_resized = image.resize((width, height))
            
            # Convert image to a NumPy array and expand dimensions to match model input
            input_data = np.expand_dims(image_resized, axis=0)
            
            # Normalize pixel values if the model expects float32 input
            if self.input_details[0]['dtype'] == np.float32:
                # Normalize to [-1, 1] range
                input_data = (np.float32(input_data) - 127.5) / 127.5
            
            # 3. RUN INFERENCE
            self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
            self.interpreter.invoke()
            output_data = self.interpreter.get_tensor(self.output_details[0]['index'])
            
            # Squeeze the output to get a single probability value
            probability = np.squeeze(output_data)
            
            # Map the probability to the 'failure' class
            failure_index = self.labels.index('failure')
            # Note: This logic assumes a multi-class model. If your model is binary,
            # it might just output one value. We'll assume the output corresponds to the labels.
            failure_prob = probability[failure_index] if hasattr(probability, "__len__") else (probability if failure_index == 1 else 1 - probability)

            self._logger.info(f"Failure check complete. Failure probability: {failure_prob:.2%}")

            # 4. TAKE ACTION
            confidence_threshold = self._settings.get_float(["failure_confidence"])
            if failure_prob > confidence_threshold:
                self._logger.warning(f"FAILURE DETECTED! (Confidence: {failure_prob:.2%}). Pausing print.")
                self._printer.pause_print(reason="ai_failure_detection")
                
                # Stop monitoring after a failure is detected to prevent repeated pauses
                self.is_printing = False

        except requests.exceptions.RequestException as e:
            self._logger.warning(f"Could not retrieve webcam snapshot: {e}")
        except Exception as e:
            self._logger.error(f"An unexpected error occurred during failure check: {e}")


# --- OctoPrint Plugin Boilerplate ---

__plugin_name__ = "AI Failure Detector"
__plugin_pythoncompat__ = ">=3.7,<4"

def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FailureDetectorPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {}

    global __plugin_settings_overlay__
    __plugin_settings_overlay__ = dict(
        appearance=dict(
            components=dict(
                settings=dict(
                    plugins=dict(
                        failuredetector=dict(
                            _displayName=__plugin_implementation__.get_settings_defaults()["_displayName"] if "_displayName" in __plugin_implementation__.get_settings_defaults() else __plugin_name__,
                            _disabled=not TFLITE_AVAILABLE
                        )
                    )
                )
            )
        )
    )
