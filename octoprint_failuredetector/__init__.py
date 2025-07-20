# __init__.py (Updated for Timelapse Selection Workflow)
# ... (all existing imports are the same)
import shutil # For cleaning up temporary files

# --- NEW: Import OpenCV ---
try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False

class FailureDetectorPlugin(
    # ... (class definition is the same)
):
    # ... (__init__, on_after_startup, _load_community_credentials, load_model are the same)

    def get_api_commands(self):
        return dict(
            force_check=[],
            # --- NEW: Command to list all recorded timelapses ---
            list_recorded_timelapses=[],
            # --- MODIFIED: This now accepts a filename and extracts frames ---
            list_timelapse_frames=["filename"],
            upload_failure_data=[ # This is now more important
                "failure_type", "failed_frame_path", 
                "bounding_boxes", "include_settings"
            ]
        )

    def on_api_command(self, command, data):
        if command == "force_check":
            # ... (this is the same)
        
        elif command == "list_recorded_timelapses":
            self._logger.info("API call received to list recorded timelapses.")
            try:
                timelapse_dir = self._settings.global_get_folder("timelapse")
                mp4_files = sorted(glob.glob(os.path.join(timelapse_dir, "*.mp4")), key=os.path.getmtime, reverse=True)
                
                # Create a list of dictionaries with file info
                timelapse_info = [
                    {"name": os.path.basename(f), "size_mb": round(os.path.getsize(f) / (1024*1024), 2)}
                    for f in mp4_files
                ]
                self._plugin_manager.send_plugin_message(self._identifier, {"type": "recorded_timelapse_list", "timelapses": timelapse_info})
            except Exception as e:
                self._logger.exception("Error listing recorded timelapses:")

        elif command == "list_timelapse_frames":
            filename = data.get("filename")
            # --- NEW: Call the frame extraction logic ---
            self._extract_frames_from_video(filename)
        
        elif command == "upload_failure_data":
            # ... (this is the same)

    # --- NEW: The core frame extraction logic ---
    def _extract_frames_from_video(self, filename):
        self._logger.info(f"Extracting frames from {filename}...")
        if not OPENCV_AVAILABLE:
            self._logger.error("OpenCV is not installed. Cannot extract frames.")
            return

        try:
            timelapse_dir = self._settings.global_get_folder("timelapse")
            video_path = os.path.join(timelapse_dir, filename)
            
            # Create a unique temporary sub-folder for these frames
            tmp_dir = self._settings.global_get_folder("timelapse_tmp")
            unique_folder_name = str(uuid.uuid4())
            frame_output_dir = os.path.join(tmp_dir, unique_folder_name)
            os.makedirs(frame_output_dir)

            cap = cv2.VideoCapture(video_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            # Calculate the step to get ~10 frames (or less if the video is short)
            step = max(1, total_frames // 10)
            
            extracted_frame_paths = []
            for frame_num in range(0, total_frames, step):
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
                ret, frame = cap.read()
                if ret:
                    frame_name = f"frame_{frame_num:06d}.jpg"
                    full_frame_path = os.path.join(frame_output_dir, frame_name)
                    cv2.imwrite(full_frame_path, frame)
                    # We need a path relative to the served directory for the URL
                    relative_path = os.path.join("tmp", unique_folder_name, frame_name)
                    extracted_frame_paths.append(relative_path)
            
            cap.release()
            self._logger.info(f"Successfully extracted {len(extracted_frame_paths)} frames.")
            self._plugin_manager.send_plugin_message(self._identifier, {"type": "frame_list", "frames": extracted_frame_paths})

        except Exception as e:
            self._logger.exception(f"Error extracting frames from {filename}:")

    # ... (the rest of the __init__.py file is the same as the last working version) ...
