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
        """Initializes the plugin's state."""
        self.is_printing = False
        self.detection_thread = None
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
        self.load_model()

    def load_model(self):
        """Loads the TFLite model and labels from the plugin's bundled files."""
        try:
            model_path = os.path.join(self._basefolder, "print_failure_model.tflite")
            labels_path = os.path.join(self._basefolder, "labels.txt")
            
            if not os.path.exists(model_path) or not os.path.exists(labels_path):
                self._logger.error("Model or labels file not found. Make sure they are in the plugin's main folder.")
                return

            self.interpreter = Interpreter(model_path=model_path)
            self.interpreter.allocate_tensors()
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()
            
            with open(labels_path, 'r') as f:
                self.labels = [line.strip() for line in f.readlines()]
            
            self._logger.info(f"AI Model loaded successfully from: {model_path}")

        except Exception as e:
            self._logger.error(f"An error occurred while loading the AI model: {e}")
            self.interpreter = None

    # ~~ SettingsPlugin mixin ~~
    def get_settings_defaults(self):
        """Defines the default settings for the plugin."""
        return dict(
            check_interval=15,
            failure_confidence=0.8,
            webcam_snapshot_url="http://127.0.0.1:8080/?action=snapshot"
        )
    
    # ~~ TemplatePlugin mixin ~~
    def get_template_configs(self):
        """Defines the UI templates for the navbar, settings, and main tab."""
        return [
            dict(type="navbar", custom_bindings=False),
            dict(type="settings", custom_bindings=False),
            dict(type="tab", name="Failure Detector", custom_bindings=False)
        ]

    # ~~ AssetPlugin mixin ~~
    def get_assets(self):
        """Defines the plugin's JavaScript files."""
        return dict(
            js=["js/failuredetector.js", "js/failuredetector_settings.js"]
        )

    # ~~ SimpleApiPlugin mixin ~~
    def get_api_commands(self):
        """Defines the API commands the frontend can send to the backend."""
        return dict(
            force_check=[],
            save_settings=["snapshot_url", "interval", "confidence"]
        )

    def on_api_command(self, command, data):
        """Handles API commands received from the frontend."""
        if command == "force_check":
            self._logger.info("Forcing a manual failure check via API.")
            check_thread = threading.Thread(target=self.perform_check)
            check_thread.daemon = True
            check_thread.start()
        
        elif command == "save_settings":
            self._logger.info("Saving settings from plugin tab.")
            self._settings.set(["webcam_snapshot_url"], data.get("snapshot_url"))
            self._settings.set_int(["check_interval"], int(data.get("interval")))
            self._settings.set_float(["failure_confidence"], float(data.get("confidence")))
            self._settings.save()
            self._plugin_manager.send_plugin_message(self._identifier, {"type": "settings_saved"})

    # ~~ EventHandlerPlugin mixin ~~
    def on_event(self, event, payload):
        """Reacts to events fired by OctoPrint."""
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
            
    # ~~ Core Logic ~~
    def detection_loop(self):
        """The main loop that periodically checks for print failures."""
        while self.is_printing:
            if self.interpreter:
                self.perform_check()
            else:
                self._logger.warning("Skipping check because the AI model is not loaded.")
                self.is_printing = False
                break

            check_interval = self._settings.get_int(["check_interval"])
            for _ in range(check_interval):
                if not self.is_printing:
                    break
                time.sleep(1)

    def perform_check(self):
        """Captures a webcam image, runs inference, and takes action."""
        self._plugin_manager.send_plugin_message(self._identifier, dict(status="checking"))
        snapshot_url = self._settings.get(["webcam_snapshot_url"])

        try:
            response = requests.get(snapshot_url, timeout=5)
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
            probability = np.squeeze(output_data)
            
            failure_index = self.labels.index('failure')
            failure_prob = probability[failure_index] if hasattr(probability, "__len__") else (probability if failure_index == 1 else 1 - probability)

            self._logger.info(f"Failure check complete. Failure probability: {failure_prob:.2%}")
            self._plugin_manager.send_plugin_message(self._identifier, dict(status="idle", result=f"{failure_prob:.2%}", snapshot_url=snapshot_url))

            confidence_threshold = self._settings.get_float(["failure_confidence"])
            if failure_prob > confidence_threshold and self.is_printing:
                self._logger.warning(f"FAILURE DETECTED! (Confidence: {failure_prob:.2%}). Pausing print.")
                self._plugin_manager.send_plugin_message(self._identifier, dict(status="failure", result=f"{failure_prob:.2%}", snapshot_url=snapshot_url))
                self._printer.pause_print(reason="ai_failure_detection")
                self.is_printing = False

        except Exception as e:
            self._logger.error(f"An unexpected error occurred during failure check: {e}")
            self._plugin_manager.send_plugin_message(self._identifier, dict(status="error", error=str(e)))

    # ~~ Software Update Hook ~~
    def get_update_information(self):
        return dict(
            failuredetector=dict(
                displayName="AI Failure Detector",
                displayVersion=self._plugin_version,
                type="github_release",
                user="YourUsername", # Replace with your GitHub username
                repo="Local-Failure-Detection", # Replace with your repository name
                current=self._plugin_version,
                pip="https://github.com/{user}/{repo}/archive/{target_version}.zip"
            )
        )

# --- This is the critical boilerplate that OctoPrint needs to load the plugin ---
__plugin_name__ = "AI Failure Detector"
__plugin_pythoncompat__ = ">=3.7,<4"

def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FailureDetectorPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
    }```

### Next Steps

1.  **Save the file** with the complete code above.
2.  **Re-install the plugin** on your Pi to ensure OctoPrint sees the corrected file:
    ```bash
    pip install -e .
    ```
3.  **Restart the OctoPrint service:**
    ```bash
    sudo service octoprint restart
    ```

After these steps, the "incompatible" warning in the Plugin Manager should be gone, and the plugin should load and function correctly.
