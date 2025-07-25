# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
from flask import Blueprint, send_from_directory
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

FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None

class FailureDetectorPlugin(
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.EventHandlerPlugin,
    octoprint.plugin.SettingsPlugin,
    octoprint.plugin.TemplatePlugin,
    octoprint.plugin.SimpleApiPlugin,
    octoprint.plugin.AssetPlugin,
    octoprint.plugin.BlueprintPlugin
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
        self.octolapse_is_present = False

    def on_after_startup(self):
        self._logger.info("AI Failure Detector starting up...")
        if not TFLITE_AVAILABLE:
            self._logger.error("TensorFlow Lite runtime is not installed. AI features will be disabled.")
        if not FFMPEG_AVAILABLE:
            self._logger.error("FFmpeg executable not found in PATH. Timelapse features will be disabled.")
        
        if self._plugin_manager.get_plugin("octolapse") is not None:
            self._logger.info("Octolapse plugin detected. Enabling integration option.")
            self.octolapse_is_present = True
        
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

    @octoprint.plugin.BlueprintPlugin.route("/temp_frame/<path:filename>", methods=["GET"])
    def serve_temp_frame(self, filename):
        temp_dir = self._settings.getBaseFolder("timelapse_tmp")
        return send_from_directory(temp_dir, filename)

    @octoprint.plugin.BlueprintPlugin.route("/thumbnail/<path:filename>", methods=["GET"])
    def serve_thumbnail(self, filename):
        thumb_dir = os.path.join(self._settings.getBaseFolder("timelapse"), "thumbnails")
        return send_from_directory(thumb_dir, filename)

    def get_settings_defaults(self):
        return dict(
            detection=dict(
                enabled=True,
                trigger="timer",
                check_interval=15,
                failure_confidence=0.8
            ),
            webcam_snapshot_url="http://127.0.0.1:8080/?action=snapshot"
        )
    
    # --- THIS IS THE NEW, ROBUST METHOD TO ADD DATA TO THE SETTINGS UI ---
    def get_settings_preprocessors(self):
        def inject_octolapse_status(settings, *args, **kwargs):
            settings["plugins"]["failuredetector"]["detection"]["octolapse_is_present"] = self.octolapse_is_present
            return settings
        return [("settings", inject_octolapse_status)]

    def get_template_configs(self):
        return [
            dict(type="settings", custom_bindings=False),
            dict(type="navbar", custom_bindings=False),
            dict(type="tab", name="Failure Detector", custom_bindings=False),
            dict(type="generic", template="failuredetector_modal.jinja2")
        ]

    # --- THIS IS NOW CORRECTED TO ONLY LOAD THE ONE WORKING JS FILE ---
    def get_assets(self):
        return dict(
            js=["js/failuredetector.js"]
        )

    def get_api_commands(self):
        return dict(
            force_check=[],
            list_recorded_timelapses=[],
            list_timelapse_frames=["filename"],
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
        
        elif command == "list_recorded_timelapses":
            self._logger.info("API call received to list recorded timelapses.")
            try:
                timelapse_dir = self._settings.getBaseFolder("timelapse")
                thumb_dir = os.path.join(timelapse_dir, "thumbnails")
                if not os.path.exists(thumb_dir):
                    os.makedirs(thumb_dir)
                mp4_files = sorted(glob.glob(os.path.join(timelapse_dir, "*.mp4")), key=os.path.getmtime, reverse=True)
                timelapse_info = []
                for f_path in mp4_files:
                    f_name = os.path.basename(f_path)
                    thumb_name = f_name.replace(".mp4", ".jpg")
                    thumb_path = os.path.join(thumb_dir, thumb_name)
                    if not os.path.exists(thumb_path):
                        self._generate_thumbnail(f_path, thumb_path)
                    timelapse_info.append({
                        "name": f_name,
                        "size_mb": round(os.path.getsize(f_path) / (1024*1024), 2),
                        "thumbnail_url": f"plugin/{self._identifier}/thumbnail/{thumb_name}"
                    })
                self._plugin_manager.send_plugin_message(self._identifier, {"type": "recorded_timelapse_list", "timelapses": timelapse_info})
            except Exception as e:
                self._logger.exception("Error listing recorded timelapses:")
                self._plugin_manager.send_plugin_message(self._identifier, {"type": "error", "message": "Could not list timelapses. Check log."})

        elif command == "list_timelapse_frames":
            filename = data.get("filename")
            extract_thread = threading.Thread(target=self._extract_frames_from_video, args=(filename,))
            extract_thread.daemon = True
            extract_thread.start()
        
        elif command == "upload_failure_data":
            upload_thread = threading.Thread(target=self._upload_to_database, args=(data,))
            upload_thread.daemon = True
            upload_thread.start()
    
    def _generate_thumbnail(self, video_path, thumb_path):
        self._logger.info(f"Generating thumbnail for {os.path.basename(video_path)}...")
        try:
            ffmpeg_cmd = ["ffmpeg", "-i", video_path, "-ss", "00:00:01.000", "-vframes", "1", "-q:v", "3", thumb_path]
            subprocess.run(ffmpeg_cmd, check=True, capture_output=True, text=True)
            self._logger.info("Thumbnail generated successfully.")
        except Exception as e:
            self._logger.exception("Failed to generate thumbnail:")

    def on_event(self, event, payload):
        if not self._settings.get_bool(["detection", "enabled"]):
            return

        if event == "PrintStarted":
            if self._settings.get(["detection", "trigger"]) == "timer":
                self._logger.info("Print started. Starting detection timer.")
                self.is_printing = True
                self.detection_thread = threading.Thread(target=self.detection_loop)
                self.detection_thread.daemon = True
                self.detection_thread.start()
        
        elif event == "octolapse_snapshot_taken":
            if self._settings.get(["detection", "trigger"]) == "octolapse":
                self._logger.info("Octolapse frame captured. Triggering failure check.")
                self.perform_check()

        elif event in ("PrintCancelled", "PrintFailed"):
            self.is_printing = False
            self._plugin_manager.send_plugin_message(self._identifier, dict(status="idle"))

        elif event == "PrintDone":
            self.is_printing = False
            self._logger.info("Print finished. Triggering failure report dialog.")
            self._plugin_manager.send_plugin_message(self._identifier, {"type": "show_post_print_dialog"})

    def _extract_frames_from_video(self, filename):
        self._logger.info(f"Extracting frames from {filename} using FFmpeg...")
        if not FFMPEG_AVAILABLE:
            self._logger.error("FFmpeg is not installed. Cannot extract frames.")
            self._plugin_manager.send_plugin_message(self._identifier, {"type": "frame_list", "frames": [], "error": "FFmpeg backend not installed."})
            return
        try:
            timelapse_dir = self._settings.getBaseFolder("timelapse")
            video_path = os.path.join(timelapse_dir, filename)
            tmp_dir = self._settings.getBaseFolder("timelapse_tmp")
            unique_folder_name = str(uuid.uuid4())
            frame_output_dir = os.path.join(tmp_dir, unique_folder_name)
            if os.path.exists(frame_output_dir):
                shutil.rmtree(frame_output_dir)
            os.makedirs(frame_output_dir)
            ffprobe_cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "default=nokey=1:noprint_wrappers=1", video_path]
            process = subprocess.run(ffprobe_cmd, capture_output=True, text=True, check=True)
            total_frames = int(process.stdout.strip())
            sample_count = 10
            step = max(1, total_frames // sample_count)
            ffmpeg_cmd = ["ffmpeg", "-i", video_path, "-vf", f"select='not(mod(n,{step}))'", "-vsync", "vfr", "-q:v", "2", os.path.join(frame_output_dir, "frame_%06d.jpg")]
            self._logger.info(f"Running FFmpeg command: {' '.join(ffmpeg_cmd)}")
            subprocess.run(ffmpeg_cmd, check=True, capture_output=True, text=True)
            extracted_frames = sorted(glob.glob(os.path.join(frame_output_dir, "*.jpg")))
            extracted_frame_paths = [os.path.join(unique_folder_name, os.path.basename(p)) for p in extracted_frames]
            self._logger.info(f"Successfully extracted {len(extracted_frame_paths)} frames.")
            self._plugin_manager.send_plugin_message(self._identifier, {"type": "frame_list", "frames": extracted_frame_paths, "base": f"plugin/{self._identifier}/temp_frame"})
        except subprocess.CalledProcessError as e:
            self._logger.error(f"FFmpeg/FFprobe failed. Return code: {e.returncode}")
            self._logger.error(f"FFmpeg/FFprobe stderr: {e.stderr}")
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
            confidence_threshold = self._settings.get_float(["detection", "failure_confidence"])
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
        if not self.community_creds or not DATABASE_LIBS_AVAILABLE:
            self._logger.error("Community credentials or database libraries not loaded. Aborting upload.")
            self._plugin_manager.send_plugin_message(self._identifier, {"message": "Error: Backend not configured."})
            return
        try:
            failed_frame_filename = data.get("failed_frame_path")
            if not failed_frame_filename:
                self._logger.error("No failed frame filename was provided.")
                return
            
            image_bytes_obj = None
            if failed_frame_filename == "last_snapshot.jpg":
                snapshot_url = self._settings.get(["webcam_snapshot_url"])
                response = requests.get(snapshot_url, timeout=10)
                response.raise_for_status()
                image_bytes_obj = BytesIO(response.content)
            else:
                tmp_dir = self._settings.getBaseFolder("timelapse_tmp")
                full_path_to_image = os.path.join(tmp_dir, failed_frame_filename)
                if not os.path.exists(full_path_to_image):
                    self._logger.error(f"Cannot find specified frame on disk: {full_path_to_image}")
                    return
                image_bytes_obj = open(full_path_to_image, "rb")

            s3_client = boto3.client('s3',
                endpoint_url=f"https://{self.community_creds['b2_endpoint_url']}",
                aws_access_key_id=self.community_creds['b2_key_id'],
                aws_secret_access_key=self.community_creds['b2_app_key'])
            unique_filename = f"{data.get('failure_type', 'unknown')}-{uuid.uuid4()}.jpg"
            s3_client.upload_fileobj(image_bytes_obj, self.community_creds['b2_bucket_name'], unique_filename)
            image_public_url = f"https://{self.community_creds['b2_bucket_name']}.{self.community_creds['b2_endpoint_url']}/{unique_filename}"
            
            image_bytes_obj.close()

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
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
    }
